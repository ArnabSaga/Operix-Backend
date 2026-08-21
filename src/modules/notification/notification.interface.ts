import type { Notification } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export interface SafeNotificationActorResponse {
  id: string;
  name: string;
}

export type SafeNotificationResponse = Pick<
  Notification,
  | 'id'
  | 'actorId'
  | 'type'
  | 'title'
  | 'body'
  | 'targetType'
  | 'targetId'
  | 'readAt'
  | 'createdAt'
> & {
  isRead: boolean;
  actor: SafeNotificationActorResponse | null;
};

export interface PaginatedNotificationResponse {
  data: SafeNotificationResponse[];
  meta: PaginationMeta;
}

export interface NotificationUnreadCountResponse {
  count: number;
}

export interface NotificationReadAllResponse {
  updatedCount: number;
  markedAt: Date;
}
