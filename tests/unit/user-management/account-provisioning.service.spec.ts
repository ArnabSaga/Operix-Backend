import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { USER_MANAGEMENT_ERROR_CODE } from '../../../src/modules/user-management/user-management.constant';

const jestApi = import.meta.jest;
const signUpEmailMock = jestApi.fn();

jestApi.unstable_mockModule('../../../src/modules/auth/auth.factory', () => ({
  createOperixProvisioningAuth: jestApi.fn(() => ({
    api: {
      signUpEmail: signUpEmailMock,
    },
  })),
}));

const { AccountProvisioningService } =
  await import('../../../src/modules/user-management/account-provisioning.service');

function createConfig(): ConfigService {
  return new ConfigService({
    auth: {
      baseUrl: 'http://localhost:5000',
      secret: 'test-secret-that-is-long-enough-for-auth',
    },
  });
}

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

describe('AccountProvisioningService', () => {
  beforeEach(() => {
    signUpEmailMock.mockReset();
    signUpEmailMock.mockResolvedValue({});
  });

  it('verifies the created-user postcondition after Better Auth signup', async () => {
    const prisma = {
      user: {
        findUnique: jestApi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        update: jestApi.fn(),
        deleteMany: jestApi.fn(),
      },
    };
    const service = new AccountProvisioningService(
      prisma as unknown as PrismaService,
      createConfig(),
    );

    try {
      await service.provisionAccount({
        name: 'Admin A',
        email: 'admin-a@example.com',
        initialPassword: 'super-secret-1',
        role: UserRole.ADMIN,
      });
      throw new Error('Expected provisioning to fail.');
    } catch (error) {
      expect(signUpEmailMock).toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: USER_MANAGEMENT_ERROR_CODE.ACCOUNT_PROVISIONING_FAILED,
      });
    }
  });

  it('cleans up the created user when Operix enrichment fails', async () => {
    const createdUser = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const enrichmentError = new Error('update failed');
    const prisma = {
      user: {
        findUnique: jestApi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(createdUser),
        update: jestApi.fn().mockRejectedValue(enrichmentError),
        deleteMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AccountProvisioningService(
      prisma as unknown as PrismaService,
      createConfig(),
    );

    await expect(
      service.provisionAccount({
        name: 'Admin A',
        email: 'admin-a@example.com',
        initialPassword: 'super-secret-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBe(enrichmentError);

    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'admin-a',
      },
    });
  });
});
