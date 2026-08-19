import type { Task } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export type SafeTaskResponse = Pick<
  Task,
  | 'id'
  | 'referenceCode'
  | 'title'
  | 'description'
  | 'remarks'
  | 'priority'
  | 'status'
  | 'dueAt'
  | 'startedAt'
  | 'completedAt'
  | 'cancelledAt'
  | 'teamId'
  | 'categoryId'
  | 'createdById'
  | 'createdAt'
  | 'updatedAt'
>;

export interface PaginatedTaskResponse {
  data: SafeTaskResponse[];
  meta: PaginationMeta;
}
