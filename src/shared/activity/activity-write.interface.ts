import type { Prisma } from '../../../generated/prisma/client.js';

export interface ActivityWriteInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}
