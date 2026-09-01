import type { PrismaTransactionClient } from '../database/transaction-client.type.js';
import type { NotificationWriteInput } from './notification-write.interface.js';
import { resolvePublicReference } from '../identity/public-reference.js';

export async function createNotification(
  tx: PrismaTransactionClient,
  input: NotificationWriteInput,
): Promise<void> {
  const targetPublicId = await resolvePublicReference(
    tx,
    input.targetType,
    input.targetId,
  );
  await tx.notification.create({
    data: {
      receiverId: input.receiverId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ...(targetPublicId ? { targetPublicId } : {}),
    },
  });
}
