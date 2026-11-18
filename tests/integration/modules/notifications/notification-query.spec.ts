import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../../../../src/database/prisma.service';
import { NotificationService } from '../../../../src/modules/notification/notification.service';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import type { OperixViewer } from '../../../../src/shared/auth/viewer.interface';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';
import { createTestApplication } from '../../../support/server/create-test-application';

describe('Notification query integration', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let receiverId: string | undefined;

  beforeAll(async () => {
    const databaseUrl = getTestDatabaseUrl();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = databaseUrl;
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.FRONTEND_APP_URL = 'http://localhost:3001';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.SMTP_ENABLED = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';

    app = await createTestApplication();
    const prismaClient = app.get(PrismaService);
    prisma = prismaClient;

    receiverId = `notification-query-${randomUUID()}`;
    await prismaClient.user.create({
      data: {
        id: receiverId,
        name: 'Notification Query Receiver',
        email: `${receiverId}@operix.test`,
        role: UserRole.SUPER_ADMIN,
      },
    });

    await prismaClient.notification.createMany({
      data: [
        {
          receiverId,
          type: 'REGISTRATION_REQUESTED',
          title: 'Resolved registration request',
          body: 'An older request was already decided.',
          targetType: 'REGISTRATION_REQUEST',
          targetId: `${receiverId}-request-a`,
          targetPublicId: randomUUID(),
          resolvedAt: new Date('2026-11-10T09:00:00.000Z'),
          resolution: 'APPROVED',
        },
        {
          receiverId,
          type: 'REGISTRATION_REQUESTED',
          title: 'Open registration request',
          body: 'A newer request still needs a decision.',
          targetType: 'REGISTRATION_REQUEST',
          targetId: `${receiverId}-request-b`,
          targetPublicId: randomUUID(),
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma && receiverId) {
      await prisma.notification.deleteMany({ where: { receiverId } });
      await prisma.user.delete({ where: { id: receiverId } });
    }

    await app?.close();
  });

  it('selects the resolution columns without failing and keeps read separate', async () => {
    const notificationService = getApp(app).get(NotificationService);
    const viewer = createViewer(getReceiverId(receiverId));

    const page = await notificationService.listNotifications(viewer, {
      page: 1,
      limit: 20,
    });

    expect(page.data).toHaveLength(2);

    const resolved = page.data.find(
      (notification) => notification.actionState === 'RESOLVED',
    );
    const actionable = page.data.find(
      (notification) => notification.actionState === 'ACTIONABLE',
    );

    expect(resolved).toMatchObject({
      resolution: 'APPROVED',
      isRead: false,
    });
    expect(resolved?.resolvedAt?.toISOString()).toBe(
      '2026-11-10T09:00:00.000Z',
    );
    expect(actionable).toMatchObject({
      resolution: null,
      resolvedAt: null,
      isRead: false,
    });

    // A resolved notification that was never opened still counts as unread.
    await expect(notificationService.getUnreadCount(viewer)).resolves.toEqual({
      count: 2,
    });
  });
});

function createViewer(userId: string): OperixViewer {
  return {
    userId,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    scope: { type: 'GLOBAL' },
  };
}

function getApp(
  application: NestExpressApplication | undefined,
): NestExpressApplication {
  if (!application) {
    throw new Error('Nest test application was not initialized');
  }

  return application;
}

function getReceiverId(id: string | undefined): string {
  if (!id) {
    throw new Error('Notification receiver fixture was not initialized');
  }

  return id;
}
