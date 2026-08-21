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
> & {
  isOverdue: boolean;
};

export interface PaginatedTaskResponse {
  data: SafeTaskResponse[];
  meta: PaginationMeta;
}

export interface SafeTaskStatusHistoryResponse {
  id: string;
  taskId: string;
  fromStatus: Task['status'] | null;
  toStatus: Task['status'];
  changedById: string;
  notes: string | null;
  changedAt: Date;
}

export interface PaginatedTaskStatusHistoryResponse {
  data: SafeTaskStatusHistoryResponse[];
  meta: PaginationMeta;
}
