import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export interface SafeNotificationActorResponse {
  id: string;
  name: string;
}

export interface SafeNotificationResponse {
  id: string;
  type: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  readAt: Date | null;
  createdAt: Date;
  isRead: boolean;
  actor: SafeNotificationActorResponse | null;
}

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
