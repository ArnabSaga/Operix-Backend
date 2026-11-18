import { HttpStatus } from '@nestjs/common';
import type { PrismaTransactionClient } from '../../../shared/database/transaction-client.type.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../../shared/errors/app.exception.js';
import { TaskStatus, UserRole } from '../../../../generated/prisma/enums.js';
import { TASK_ERROR_CODE } from '../task.constant.js';

export type TaskAssignmentPolicyClient = Pick<PrismaTransactionClient, 'task'>;

export const assignableTaskSelect = {
  id: true,
  publicId: true,
  referenceCode: true,
  title: true,
  description: true,
  remarks: true,
  priority: true,
  dueAt: true,
  status: true,
  scope: true,
  createdById: true,
  completionMode: true,
  team: { select: { name: true } },
  category: { select: { id: true, name: true } },
  assignments: {
    where: { unassignedAt: null },
    select: { responsibleUserId: true },
    take: 2,
  },
} as const;

export async function resolveAssignableTask(
  client: TaskAssignmentPolicyClient,
  viewer: OperixViewer,
  taskPublicId: string,
) {
  const task = await client.task.findFirst({
    where: { publicId: taskPublicId },
    select: assignableTaskSelect,
  });

  if (!task) {
    throw new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_NOT_FOUND,
      'Task not found.',
    );
  }

  const hasAuthority =
    viewer.role === UserRole.SUPER_ADMIN ||
    (viewer.role === UserRole.ADMIN && task.createdById === viewer.userId);

  if (!hasAuthority) {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this action.',
    );
  }

  if (
    task.status !== TaskStatus.PENDING &&
    task.status !== TaskStatus.ASSIGNED
  ) {
    throw new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.INVALID_TASK_TRANSITION,
      'Task responsibility is locked.',
    );
  }

  return task;
}
