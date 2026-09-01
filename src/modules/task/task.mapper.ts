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
    teamId: task.team.publicId,
    categoryId: task.category?.publicId ?? null,
    createdById: task.createdBy.publicId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    isOverdue: isTaskOverdue(task, now),
  };
}
