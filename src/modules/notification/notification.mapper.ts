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
    ...notification,
    isRead: notification.readAt !== null,
  };
}
