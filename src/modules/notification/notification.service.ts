import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { NOTIFICATION_ERROR_CODE } from './notification.constant.js';
import type {
  NotificationReadAllResponse,
  NotificationUnreadCountResponse,
  PaginatedNotificationResponse,
  SafeNotificationResponse,
} from './notification.interface.js';
import { mapNotificationResponse } from './notification.mapper.js';
import { notificationSelect } from './notification.select.js';
import type { ListNotificationQueryDto } from './dto/list-notification-query.dto.js';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(
    viewer: OperixViewer,
    query: ListNotificationQueryDto,
  ): Promise<PaginatedNotificationResponse> {
    const normalized = normalizePagination(query);
    const where = buildNotificationWhere(viewer.userId, query);

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: data.map(mapNotificationResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getUnreadCount(
    viewer: OperixViewer,
  ): Promise<NotificationUnreadCountResponse> {
    const count = await this.prisma.notification.count({
      where: {
        receiverId: viewer.userId,
        readAt: null,
      },
    });

    return { count };
  }

  async markNotificationRead(
    viewer: OperixViewer,
    notificationId: string,
  ): Promise<SafeNotificationResponse> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        receiverId: viewer.userId,
      },
      select: notificationSelect,
    });

    if (!notification) {
      throw notificationNotFound();
    }

    if (notification.readAt !== null) {
      return mapNotificationResponse(notification);
    }

    const updated = await this.prisma.notification.update({
      where: {
        id: notification.id,
      },
      data: {
        readAt: new Date(),
      },
      select: notificationSelect,
    });

    return mapNotificationResponse(updated);
  }

  async markAllRead(
    viewer: OperixViewer,
  ): Promise<NotificationReadAllResponse> {
    const markedAt = new Date();
    const result = await this.prisma.notification.updateMany({
      where: {
        receiverId: viewer.userId,
        readAt: null,
      },
      data: {
        readAt: markedAt,
      },
    });

    return {
      updatedCount: result.count,
      markedAt,
    };
  }
}

function buildNotificationWhere(
  userId: string,
  query: ListNotificationQueryDto,
): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {
    receiverId: userId,
  };

  if (query.read !== undefined) {
    where.readAt = query.read ? { not: null } : null;
  }

  if (query.type) {
    where.type = query.type;
  }

  return where;
}

function notificationNotFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    NOTIFICATION_ERROR_CODE.NOTIFICATION_NOT_FOUND,
    'Notification not found.',
  );
}
