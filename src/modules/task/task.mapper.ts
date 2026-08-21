import type { Task } from '../../../generated/prisma/client.js';
import { TaskStatus } from '../../../generated/prisma/enums.js';
import type { SafeTaskResponse } from './task.interface.js';

export type TaskResponseSource = Pick<
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
    ...task,
    isOverdue: isTaskOverdue(task, now),
  };
}
