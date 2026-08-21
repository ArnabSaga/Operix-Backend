import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { ActivityService } from '../../../src/modules/activity/activity.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const createdAt = new Date('2026-08-21T10:00:00.000Z');

function createViewer(role: UserRole): OperixViewer {
  return {
    userId:
      role === UserRole.ADMIN
        ? 'admin-a'
        : role === UserRole.MEMBER
          ? 'member-a'
          : 'chief-a',
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

function activity() {
  return {
    id: 'activity-a',
    actorId: 'member-a',
    action: 'TASK_STARTED',
    entityType: 'TASK',
    entityId: 'task-a',
    metadata: { taskId: 'task-a' },
    createdAt,
    actor: {
      id: 'member-a',
      name: 'Member A',
    },
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

describe('ActivityService', () => {
  it('uses global visibility for Super Admin and applies filters with AND', async () => {
    const prisma = {
      activityLog: {
        findMany: jestApi.fn().mockResolvedValue([activity()]),
        count: jestApi.fn().mockResolvedValue(1),
      },
    };
    const service = new ActivityService(prisma as never);

    await expect(
      service.listActivities(createViewer(UserRole.SUPER_ADMIN), {
        action: 'TASK_STARTED',
        entityType: 'TASK',
        actorId: 'member-a',
        from: '2026-08-21T00:00:00Z',
        to: '2026-08-21T23:59:59+06:00',
      }),
    ).resolves.toEqual({
      data: [activity()],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {},
            { action: 'TASK_STARTED' },
            { entityType: 'TASK' },
            { actorId: 'member-a' },
            {
              createdAt: {
                gte: new Date('2026-08-21T00:00:00Z'),
                lte: new Date('2026-08-21T23:59:59+06:00'),
              },
            },
          ],
        },
        select: expect.any(Object) as object,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }) as Record<string, unknown>,
    );
  });

  it('resolves Admin current scope before querying ActivityLog', async () => {
    const prisma = {
      teamMember: {
        findMany: jestApi.fn().mockResolvedValue([{ memberId: 'member-a' }]),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'task-a' }]),
      },
      activityLog: {
        findMany: jestApi.fn().mockResolvedValue([]),
        count: jestApi.fn().mockResolvedValue(0),
      },
    };
    const service = new ActivityService(prisma as never);

    await service.listActivities(createViewer(UserRole.ADMIN), {
      actorId: 'other-user',
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  actorId: {
                    in: ['admin-a', 'member-a'],
                  },
                },
                {
                  entityType: 'USER',
                  entityId: {
                    in: ['member-a'],
                  },
                },
                {
                  entityType: 'TEAM',
                  entityId: {
                    in: ['team-a'],
                  },
                },
                {
                  entityType: 'TASK',
                  entityId: {
                    in: ['task-a'],
                  },
                },
              ],
            },
            {
              actorId: 'other-user',
            },
          ],
        },
      }) as Record<string, unknown>,
    );
  });

  it('scopes Member activity to self and current tasks only', async () => {
    const prisma = {
      task: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'task-a' }]),
      },
      activityLog: {
        findMany: jestApi.fn().mockResolvedValue([]),
        count: jestApi.fn().mockResolvedValue(0),
      },
    };
    const service = new ActivityService(prisma as never);

    await service.listActivities(createViewer(UserRole.MEMBER), {});

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  actorId: 'member-a',
                },
                {
                  entityType: 'USER',
                  entityId: 'member-a',
                },
                {
                  entityType: 'TASK',
                  entityId: {
                    in: ['task-a'],
                  },
                },
              ],
            },
          ],
        },
      }) as Record<string, unknown>,
    );
  });

  it('rejects Member actorId filter and ambiguous date inputs', async () => {
    const prisma = {
      task: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
    };
    const service = new ActivityService(prisma as never);

    try {
      await service.listActivities(createViewer(UserRole.MEMBER), {
        actorId: 'member-a',
      });
      throw new Error('Expected actorId filter to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }

    try {
      await service.listActivities(createViewer(UserRole.SUPER_ADMIN), {
        from: '2026-08-21T10:30:00',
      });
      throw new Error('Expected date validation to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }
  });

  it('rejects from after to', async () => {
    const service = new ActivityService({} as never);

    try {
      await service.listActivities(createViewer(UserRole.SUPER_ADMIN), {
        from: '2026-08-22T00:00:00Z',
        to: '2026-08-21T00:00:00Z',
      });
      throw new Error('Expected date range validation to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }
  });
});
