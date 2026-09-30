import {
  TaskDistributionStatus,
  TaskScope,
  TaskStatus,
  UserRole,
} from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export type TaskAttachmentMutationDecision =
  | { allowed: true; authority: TaskAttachmentMutationAuthority }
  | { allowed: false; reason: 'FORBIDDEN' | 'LOCKED' };

export const TASK_ATTACHMENT_AUTHORITY = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER_ADMIN: 'OWNER_ADMIN',
  RESPONSIBLE_MEMBER: 'RESPONSIBLE_MEMBER',
} as const;

export type TaskAttachmentMutationAuthority =
  (typeof TASK_ATTACHMENT_AUTHORITY)[keyof typeof TASK_ATTACHMENT_AUTHORITY];

interface TaskAttachmentAuthoritySource {
  createdById: string;
  responsibleUserId: string | null;
}

interface TaskAttachmentEditabilitySource {
  scope: TaskScope;
  status: TaskStatus;
  startedAt: Date | null;
  distribution: { status: TaskDistributionStatus } | null;
}

export function resolveTaskAttachmentMutationAuthority(
  viewer: OperixViewer,
  task: TaskAttachmentAuthoritySource,
): TaskAttachmentMutationAuthority | null {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return TASK_ATTACHMENT_AUTHORITY.SUPER_ADMIN;
  }

  if (viewer.role === UserRole.ADMIN && task.createdById === viewer.userId) {
    return TASK_ATTACHMENT_AUTHORITY.OWNER_ADMIN;
  }

  if (
    viewer.role === UserRole.MEMBER &&
    task.responsibleUserId === viewer.userId
  ) {
    return TASK_ATTACHMENT_AUTHORITY.RESPONSIBLE_MEMBER;
  }

  return null;
}

export function canMutateTaskAttachments(
  viewer: OperixViewer,
  task: TaskAttachmentAuthoritySource,
): boolean {
  return resolveTaskAttachmentMutationAuthority(viewer, task) !== null;
}

export function isTaskAttachmentLifecycleEditable(
  task: TaskAttachmentEditabilitySource,
): boolean {
  return (
    task.status === TaskStatus.PENDING ||
    (task.status === TaskStatus.ASSIGNED && task.startedAt === null)
  );
}

export function areTaskAttachmentsEditable(
  task: TaskAttachmentEditabilitySource,
): boolean {
  return isTaskAttachmentLifecycleEditable(task);
}

export function getTaskAttachmentMutationDecision(
  viewer: OperixViewer,
  task: TaskAttachmentAuthoritySource & TaskAttachmentEditabilitySource,
): TaskAttachmentMutationDecision {
  const authority = resolveTaskAttachmentMutationAuthority(viewer, task);

  if (!authority) {
    return { allowed: false, reason: 'FORBIDDEN' };
  }

  if (!isTaskAttachmentLifecycleEditable(task)) {
    return { allowed: false, reason: 'LOCKED' };
  }

  if (task.distribution?.status === TaskDistributionStatus.SENT) {
    const responsibleMemberGlobalException =
      task.scope === TaskScope.GLOBAL &&
      authority === TASK_ATTACHMENT_AUTHORITY.RESPONSIBLE_MEMBER;

    if (!responsibleMemberGlobalException) {
      return { allowed: false, reason: 'LOCKED' };
    }
  }

  return { allowed: true, authority };
}
