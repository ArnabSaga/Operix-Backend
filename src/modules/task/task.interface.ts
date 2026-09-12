import type { Task } from '../../../generated/prisma/client.js';
import type {
  TaskCompletionMode,
  TaskRecurrenceFrequency,
  TaskReminderStatus,
  TaskDistributionStatus,
  TaskScope,
  UserRole,
} from '../../../generated/prisma/enums.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

interface SafeTaskUserResponse {
  id: string;
  name: string;
  role: UserRole;
  employeeId: string | null;
  designation: string | null;
}

export type SafeTaskResponse = Pick<
  Task,
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
  | 'createdAt'
  | 'updatedAt'
> & {
  id: string;
  owner: SafeTaskUserResponse;
  responsible: SafeTaskUserResponse | null;
  scope: TaskScope;
  team: { id: string; name: string } | null;
  categoryId: string | null;
  scheduledStartAt: Date | null;
  completionMode: TaskCompletionMode;
  completionNote: string | null;
  allowSelfClaim: boolean;
  occurrenceKey: string | null;
  recurrence: {
    id: string;
    frequency: TaskRecurrenceFrequency;
    nextOccurrenceAt: Date;
    reminderLeadMinutes: number;
    isActive: boolean;
  } | null;
  reminder: {
    status: TaskReminderStatus;
    scheduledAt: Date;
    sentAt: Date | null;
  } | null;
  distribution: {
    status: TaskDistributionStatus;
    scheduledAt: Date;
    sentAt: Date | null;
  } | null;
  isOverdue: boolean;
};

export interface PaginatedTaskResponse {
  data: SafeTaskResponse[];
  meta: PaginationMeta;
}

export interface SafeTaskStatusHistoryResponse {
  taskId: string;
  fromStatus: Task['status'] | null;
  toStatus: Task['status'];
  changedBy: { id: string; name: string };
  notes: string | null;
  changedAt: Date;
}

export interface PaginatedTaskStatusHistoryResponse {
  data: SafeTaskStatusHistoryResponse[];
  meta: PaginationMeta;
}
