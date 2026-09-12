import {
  TaskDistributionStatus,
  TaskStatus,
  UserRole,
} from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export type TaskAttachmentMutationDecision =
  { allowed: true } | { allowed: false; reason: 'FORBIDDEN' | 'LOCKED' };

interface TaskAttachmentMutationSource {
  createdById: string;
  status: TaskStatus;
  startedAt: Date | null;
  distribution: { status: TaskDistributionStatus } | null;
}

export function canMutateTaskAttachments(
  viewer: OperixViewer,
  task: TaskAttachmentMutationSource,
): TaskAttachmentMutationDecision {
  if (
    viewer.role !== UserRole.SUPER_ADMIN &&
    task.createdById !== viewer.userId
  ) {
    return { allowed: false, reason: 'FORBIDDEN' };
  }

  const editableByState =
    task.status === TaskStatus.PENDING ||
    (task.status === TaskStatus.ASSIGNED && task.startedAt === null);
  if (
    !editableByState ||
    task.distribution?.status === TaskDistributionStatus.SENT
  ) {
    return { allowed: false, reason: 'LOCKED' };
  }

  return { allowed: true };
}
