import type { PrismaTransactionClient } from '../database/transaction-client.type.js';
import { sanitizeActivityMetadata } from './activity-metadata.helper.js';
import type { ActivityWriteInput } from './activity-write.interface.js';

export async function writeActivity(
  tx: PrismaTransactionClient,
  input: ActivityWriteInput,
): Promise<void> {
  const metadata = sanitizeActivityMetadata(input.metadata) ?? undefined;

  await tx.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
    },
  });
}
