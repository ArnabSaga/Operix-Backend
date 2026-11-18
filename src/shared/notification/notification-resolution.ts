import type { PrismaTransactionClient } from '../database/transaction-client.type.js';

export interface NotificationResolutionInput {
  /** Notification target discriminator, for example `REGISTRATION_REQUEST`. */
  targetType: string;
  /** Internal identifier stored on `notification.targetId`. */
  targetId: string;
  /** Terminal outcome recorded for display, for example `APPROVED`. */
  resolution: string;
  resolvedAt?: Date;
}

/**
 * Marks every unresolved notification about a target as resolved.
 *
 * Call this from inside the same transaction that commits the business state
 * change. Resolution is then atomic in both directions: a committed approval
 * can never leave an actionable notification behind, and a rolled-back
 * approval can never leave a resolved one.
 *
 * Resolution never touches `readAt`. Reading and resolution are separate
 * concepts, and a resolved notification may still be unread for other
 * receivers of the same target.
 */
export async function resolveNotifications(
  tx: PrismaTransactionClient,
  input: NotificationResolutionInput,
): Promise<number> {
  const result = await tx.notification.updateMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      resolvedAt: null,
    },
    data: {
      resolvedAt: input.resolvedAt ?? new Date(),
      resolution: input.resolution,
    },
  });

  return result.count;
}
