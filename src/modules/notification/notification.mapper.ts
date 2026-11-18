import type { Prisma } from '../../../generated/prisma/client.js';
import type {
  NotificationActionState,
  SafeNotificationResponse,
} from './notification.interface.js';
import { notificationSelect } from './notification.select.js';

type SelectedNotification = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export function mapNotificationResponse(
  notification: SelectedNotification,
): SafeNotificationResponse {
  return {
    id: notification.publicId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    targetType: notification.targetType,
    targetId: notification.targetPublicId,
    readAt: notification.readAt,
    resolvedAt: notification.resolvedAt,
    resolution: notification.resolution,
    actionState: resolveActionState(notification),
    createdAt: notification.createdAt,
    actor: notification.actor
      ? { id: notification.actor.publicId, name: notification.actor.name }
      : null,
    isRead: notification.readAt !== null,
  };
}

function resolveActionState(
  notification: SelectedNotification,
): NotificationActionState {
  if (notification.resolvedAt !== null) {
    return 'RESOLVED';
  }

  if (
    notification.targetType === null ||
    notification.targetPublicId === null
  ) {
    return 'UNAVAILABLE';
  }

  return 'ACTIONABLE';
}
