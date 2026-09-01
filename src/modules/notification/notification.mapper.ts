import type { Prisma } from '../../../generated/prisma/client.js';
import type { SafeNotificationResponse } from './notification.interface.js';
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
    createdAt: notification.createdAt,
    actor: notification.actor
      ? { id: notification.actor.publicId, name: notification.actor.name }
      : null,
    isRead: notification.readAt !== null,
  };
}
