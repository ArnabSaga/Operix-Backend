import type { ActivityLog, Prisma } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export interface SafeActivityActorResponse {
  id: string;
  name: string;
}

export type SafeActivityResponse = Pick<
  ActivityLog,
  'id' | 'actorId' | 'action' | 'entityType' | 'entityId' | 'createdAt'
> & {
  metadata: Prisma.JsonValue | null;
  actor: SafeActivityActorResponse | null;
};

export interface PaginatedActivityResponse {
  data: SafeActivityResponse[];
  meta: PaginationMeta;
}
