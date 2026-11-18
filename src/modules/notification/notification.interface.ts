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
  resolvedAt: Date | null;
  resolution: string | null;
  actionState: NotificationActionState;
  createdAt: Date;
  isRead: boolean;
  actor: SafeNotificationActorResponse | null;
}

/**
 * `read` and `resolved` are different concepts and must never be collapsed.
 *
 * - ACTIONABLE  the underlying job still requires reviewer action
 * - RESOLVED    the job completed; the notification stays as history
 * - UNAVAILABLE no usable target exists (no target, or an unresolved reference)
 */
export type NotificationActionState = 'ACTIONABLE' | 'RESOLVED' | 'UNAVAILABLE';

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
