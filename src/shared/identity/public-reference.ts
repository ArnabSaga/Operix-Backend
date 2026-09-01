import type { PrismaTransactionClient } from '../database/transaction-client.type.js';

export async function resolvePublicReference(
  tx: PrismaTransactionClient,
  type: string | null | undefined,
  databaseId: string | null | undefined,
): Promise<string | null> {
  if (!type || !databaseId) return null;

  // Some deliberately narrow transaction adapters (and isolated unit-test
  // clients) do not expose every Prisma delegate. A missing delegate must not
  // make an otherwise valid business mutation fail; the nullable public
  // reference is preferable to inventing or exposing a private identifier.
  const delegates = tx as PrismaTransactionClient & Record<string, unknown>;
  const canResolve = (name: string): boolean => {
    const delegate = delegates[name] as { findUnique?: unknown } | undefined;
    return typeof delegate?.findUnique === 'function';
  };

  switch (type) {
    case 'USER':
      if (!canResolve('user')) return null;
      return (
        (
          await tx.user.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'TEAM':
      if (!canResolve('team')) return null;
      return (
        (
          await tx.team.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'TASK':
      if (!canResolve('task')) return null;
      return (
        (
          await tx.task.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'SUBMISSION':
      if (!canResolve('taskSubmission')) return null;
      return (
        (
          await tx.taskSubmission.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'REPORT':
      if (!canResolve('managementReport')) return null;
      return (
        (
          await tx.managementReport.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'INVENTORY_CATEGORY':
      if (!canResolve('inventoryCategory')) return null;
      return (
        (
          await tx.inventoryCategory.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'INVENTORY_ITEM':
      if (!canResolve('inventoryItem')) return null;
      return (
        (
          await tx.inventoryItem.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'INVENTORY_ASSIGNMENT':
      if (!canResolve('inventoryAssignment')) return null;
      return (
        (
          await tx.inventoryAssignment.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    case 'REGISTRATION_REQUEST':
      if (!canResolve('registrationRequest')) return null;
      return (
        (
          await tx.registrationRequest.findUnique({
            where: { id: databaseId },
            select: { publicId: true },
          })
        )?.publicId ?? null
      );
    default:
      return null;
  }
}
