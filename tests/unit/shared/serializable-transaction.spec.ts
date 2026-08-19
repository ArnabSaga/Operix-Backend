import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  MAX_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from '../../../src/shared/database/serializable-transaction';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';

const jestApi = import.meta.jest;

function createKnownRequestError(code: string): Error {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
}

describe('runSerializableTransaction', () => {
  it('retries P2034 transaction conflicts', async () => {
    const prisma = {
      $transaction: jestApi
        .fn()
        .mockRejectedValueOnce(createKnownRequestError('P2034'))
        .mockResolvedValueOnce('ok'),
    };

    await expect(
      runSerializableTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('result'),
      ),
    ).resolves.toBe('ok');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('returns controlled conflict after retry exhaustion', async () => {
    const prisma = {
      $transaction: jestApi
        .fn()
        .mockRejectedValue(createKnownRequestError('P2034')),
    };

    try {
      await runSerializableTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('result'),
      );
      throw new Error('Expected transaction to fail.');
    } catch (error) {
      const exception = error as {
        getStatus: () => number;
        getResponse: () => unknown;
      };

      expect(prisma.$transaction).toHaveBeenCalledTimes(
        MAX_TRANSACTION_RETRIES,
      );
      expect(exception.getResponse()).toMatchObject({
        code: APP_ERROR_CODE.CONCURRENT_MODIFICATION,
      });
    }
  });
});
