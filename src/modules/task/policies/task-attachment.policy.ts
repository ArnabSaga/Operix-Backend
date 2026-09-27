import {
  TaskDistributionStatus,
  TaskStatus,
  UserRole,
} from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export type TaskAttachmentMutationDecision =
  { allowed: true } | { allowed: false; reason: 'FORBIDDEN' | 'LOCKED' };

interface TaskAttachmentAuthoritySource {
  createdById: string;
  responsibleUserId: string | null;
}

interface TaskAttachmentEditabilitySource {
  status: TaskStatus;
  startedAt: Date | null;
  distribution: { status: TaskDistributionStatus } | null;
}

export function canMutateTaskAttachments(
  viewer: OperixViewer,
  task: TaskAttachmentAuthoritySource,
): boolean {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return true;
  }

  if (viewer.role === UserRole.ADMIN && task.createdById === viewer.userId) {
    return true;
  }

  if (
    viewer.role === UserRole.MEMBER &&
    task.responsibleUserId === viewer.userId
  ) {
    return true;
  }

  return false;
}

export function areTaskAttachmentsEditable(
  task: TaskAttachmentEditabilitySource,
): boolean {
  const editableByState =
    task.status === TaskStatus.PENDING ||
    (task.status === TaskStatus.ASSIGNED && task.startedAt === null);

  return (
    editableByState && task.distribution?.status !== TaskDistributionStatus.SENT
  );
}

export function getTaskAttachmentMutationDecision(
  viewer: OperixViewer,
  task: TaskAttachmentAuthoritySource & TaskAttachmentEditabilitySource,
): TaskAttachmentMutationDecision {
  if (!canMutateTaskAttachments(viewer, task)) {
    return { allowed: false, reason: 'FORBIDDEN' };
  }

  if (!areTaskAttachmentsEditable(task)) {
    return { allowed: false, reason: 'LOCKED' };
  }

  return { allowed: true };
}
