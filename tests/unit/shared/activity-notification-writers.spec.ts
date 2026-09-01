import type { Prisma } from '../../../generated/prisma/client';
import { sanitizeActivityMetadata } from '../../../src/shared/activity/activity-metadata.helper';
import { writeActivity } from '../../../src/shared/activity/activity-write';
import type { PrismaTransactionClient } from '../../../src/shared/database/transaction-client.type';
import { createNotification } from '../../../src/shared/notification/notification-write';

const jestApi = import.meta.jest;

describe('sanitizeActivityMetadata', () => {
  it('returns a sanitized copy without mutating the original metadata', () => {
    const metadata = {
      nested: {
        accessToken: 'secret-token',
        keep: 'value',
      },
      list: [
        {
          PASSWORD: 'secret-password',
          safe: true,
        },
      ],
      public: 'ok',
    } satisfies Prisma.InputJsonObject;

    const sanitized = sanitizeActivityMetadata(metadata);

    expect(sanitized).toEqual({
      nested: {
        keep: 'value',
      },
      list: [
        {
          safe: true,
        },
      ],
      public: 'ok',
    });
    expect(metadata.nested.accessToken).toBe('secret-token');
    expect(metadata.list[0]?.PASSWORD).toBe('secret-password');
  });

  it('matches sensitive keys case-insensitively', () => {
    expect(
      sanitizeActivityMetadata({
        Authorization: 'bearer token',
        databaseUrl: 'postgresql://secret',
        ResetToken: 'reset',
        safe: 'value',
      }),
    ).toEqual({
      safe: 'value',
    });
  });
});

describe('writeActivity', () => {
  it('uses the supplied transaction client to create an activity row', async () => {
    const create = jestApi.fn().mockResolvedValue({
      id: 'activity-a',
    });
    const tx = {
      activityLog: {
        create,
      },
    } as unknown as PrismaTransactionClient;

    await writeActivity(tx, {
      actorId: 'user-a',
      action: 'MEMBER_CREATED',
      entityType: 'USER',
      entityId: 'member-a',
      metadata: {
        password: 'secret',
        safe: 'value',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      requestId: 'request-a',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-a',
        action: 'MEMBER_CREATED',
        entityType: 'USER',
        entityId: 'member-a',
        metadata: undefined,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        requestId: 'request-a',
      },
    });
  });
});

describe('createNotification', () => {
  it('uses the supplied transaction client to create a notification row', async () => {
    const create = jestApi.fn().mockResolvedValue({
      id: 'notification-a',
    });
    const tx = {
      notification: {
        create,
      },
    } as unknown as PrismaTransactionClient;

    await createNotification(tx, {
      receiverId: 'member-a',
      actorId: 'admin-a',
      type: 'MEMBER_ASSIGNED_TO_TEAM',
      title: 'Team assignment updated',
      body: 'You have been assigned to a team.',
      targetType: 'TEAM',
      targetId: 'team-a',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        receiverId: 'member-a',
        actorId: 'admin-a',
        type: 'MEMBER_ASSIGNED_TO_TEAM',
        title: 'Team assignment updated',
        body: 'You have been assigned to a team.',
        targetType: 'TEAM',
        targetId: 'team-a',
      },
    });
  });
});
