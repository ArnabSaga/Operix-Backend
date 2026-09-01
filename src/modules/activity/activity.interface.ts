import type { Prisma } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export interface SafeActivityActorResponse {
  id: string;
  name: string;
}

export interface SafeActivityResponse {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  metadata: Prisma.JsonValue | null;
  actor: SafeActivityActorResponse | null;
}

export interface PaginatedActivityResponse {
  data: SafeActivityResponse[];
  meta: PaginationMeta;
}
