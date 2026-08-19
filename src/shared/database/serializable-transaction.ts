import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import type { PrismaTransactionClient } from './transaction-client.type.js';

export const MAX_TRANSACTION_RETRIES = 3;

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  callback: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      if (isTransactionConflict(error)) {
        if (attempt < MAX_TRANSACTION_RETRIES) {
          continue;
        }

        throw new AppException(
          HttpStatus.CONFLICT,
          APP_ERROR_CODE.CONCURRENT_MODIFICATION,
          'The resource changed while processing this request. Please retry.',
        );
      }

      throw error;
    }
  }

  throw new AppException(
    HttpStatus.CONFLICT,
    APP_ERROR_CODE.CONCURRENT_MODIFICATION,
    'The resource changed while processing this request. Please retry.',
  );
}

export function isTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}
