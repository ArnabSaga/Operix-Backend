import type { Prisma, Task } from '../../../generated/prisma/client.js';
import { TaskStatus } from '../../../generated/prisma/enums.js';
import type { SafeTaskResponse } from './task.interface.js';

import { taskSelect } from './task.select.js';
export type TaskResponseSource = Prisma.TaskGetPayload<{
  select: typeof taskSelect;
}>;

export function isTaskOverdue(
  task: Pick<Task, 'dueAt' | 'status'>,
  now: Date,
): boolean {
  return (
    task.dueAt !== null &&
    task.dueAt < now &&
    task.status !== TaskStatus.COMPLETED &&
    task.status !== TaskStatus.CANCELLED
  );
}

export function mapTaskResponse(
  task: TaskResponseSource,
  now: Date,
): SafeTaskResponse {
  return {
    id: task.publicId,
    referenceCode: task.referenceCode,
    title: task.title,
    description: task.description,
    remarks: task.remarks,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    cancelledAt: task.cancelledAt,
    scheduledStartAt: task.scheduledStartAt,
    completionMode: task.completionMode,
    completionNote: task.completionNote,
    allowSelfClaim: task.allowSelfClaim,
    occurrenceKey: task.occurrenceKey,
    scope: task.scope,
    team: task.team ? { id: task.team.publicId, name: task.team.name } : null,
    categoryId: task.category?.publicId ?? null,
    owner: {
      id: task.createdBy.publicId,
      name: task.createdBy.name,
      role: task.createdBy.role,
      employeeId: task.createdBy.employeeId,
      designation: task.createdBy.designation,
    },
    responsible: task.assignments[0]
      ? {
          id: task.assignments[0].responsibleUser.publicId,
          name: task.assignments[0].responsibleUser.name,
          role: task.assignments[0].responsibleUser.role,
          employeeId: task.assignments[0].responsibleUser.employeeId,
          designation: task.assignments[0].responsibleUser.designation,
        }
      : null,
    recurrence: task.recurrence
      ? {
          id: task.recurrence.publicId,
          frequency: task.recurrence.frequency,
          nextOccurrenceAt: task.recurrence.nextOccurrenceAt,
          reminderLeadMinutes: task.recurrence.reminderLeadMinutes,
          isActive: task.recurrence.isActive,
        }
      : null,
    reminder: task.reminder,
    distribution: task.distribution,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    isOverdue: isTaskOverdue(task, now),
  };
}
