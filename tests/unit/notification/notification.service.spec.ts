import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { NOTIFICATION_ERROR_CODE } from '../../../src/modules/notification/notification.constant';
import { NotificationService } from '../../../src/modules/notification/notification.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const createdAt = new Date('2026-08-21T10:00:00.000Z');

function createViewer(role: UserRole = UserRole.MEMBER): OperixViewer {
  return {
    userId: 'member-a',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : role === UserRole.ADMIN
          ? { type: 'ADMIN', teamIds: ['team-a'] }
          : { type: 'MEMBER', teamId: 'team-a' },
  };
}

function notification(overrides = {}) {
  return {
    id: 'notification-a',
    actorId: 'admin-a',
    type: 'TASK_ASSIGNED',
    title: 'New task assigned',
    body: 'A new task has been assigned to you.',
    targetType: 'TASK',
    targetId: 'task-a',
    readAt: null,
    createdAt,
    actor: {
      id: 'admin-a',
      name: 'Admin A',
    },
    ...overrides,
  };
}

function expectAppException(
  error: unknown,
  status: number,
  code: string,
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toMatchObject({ code });
}

describe('NotificationService', () => {
  it('lists only the viewer inbox with filters, ordering, and safe response', async () => {
    const prisma = {
      notification: {
        findMany: jestApi.fn().mockResolvedValue([notification()]),
        count: jestApi.fn().mockResolvedValue(1),
      },
    };
    const service = new NotificationService(prisma as never);

    await expect(
      service.listNotifications(createViewer(), {
        read: false,
        type: 'TASK_ASSIGNED',
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual({
      data: [
        {
          ...notification(),
          isRead: false,
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        receiverId: 'member-a',
        readAt: null,
        type: 'TASK_ASSIGNED',
      },
      select: expect.any(Object) as object,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
  });

  it('returns unread count for the viewer only', async () => {
    const prisma = {
      notification: {
        count: jestApi.fn().mockResolvedValue(3),
      },
    };
    const service = new NotificationService(prisma as never);

    await expect(service.getUnreadCount(createViewer())).resolves.toEqual({
      count: 3,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: {
        receiverId: 'member-a',
        readAt: null,
      },
    });
  });

  it('marks unread notification as read and preserves already-read readAt', async () => {
    const readAt = new Date('2026-08-21T11:00:00.000Z');
    const prisma = {
      notification: {
        findFirst: jestApi
          .fn()
          .mockResolvedValueOnce(notification())
          .mockResolvedValueOnce(notification({ readAt })),
        update: jestApi.fn().mockResolvedValue(notification({ readAt })),
      },
    };
    const service = new NotificationService(prisma as never);

    await expect(
      service.markNotificationRead(createViewer(), 'notification-a'),
    ).resolves.toMatchObject({
      id: 'notification-a',
      isRead: true,
      readAt,
    });
    await expect(
      service.markNotificationRead(createViewer(), 'notification-a'),
    ).resolves.toMatchObject({
      id: 'notification-a',
      readAt,
      isRead: true,
    });

    expect(prisma.notification.update).toHaveBeenCalledTimes(1);
  });

  it('returns NOTIFICATION_NOT_FOUND for out-of-scope notification', async () => {
    const prisma = {
      notification: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = new NotificationService(prisma as never);

    try {
      await service.markNotificationRead(createViewer(), 'other-notification');
      throw new Error('Expected notification lookup to fail.');
    } catch (error) {
      expectAppException(
        error,
        HttpStatus.NOT_FOUND,
        NOTIFICATION_ERROR_CODE.NOTIFICATION_NOT_FOUND,
      );
    }
  });

  it('marks all unread viewer notifications and reports markedAt', async () => {
    const prisma = {
      notification: {
        updateMany: jestApi.fn().mockResolvedValue({ count: 6 }),
      },
    };
    const service = new NotificationService(prisma as never);

    await expect(service.markAllRead(createViewer())).resolves.toMatchObject({
      updatedCount: 6,
      markedAt: expect.any(Date) as Date,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        receiverId: 'member-a',
        readAt: null,
      },
      data: {
        readAt: expect.any(Date) as Date,
      },
    });
  });
});
