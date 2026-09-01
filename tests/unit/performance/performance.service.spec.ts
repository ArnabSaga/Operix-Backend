import { HttpStatus } from '@nestjs/common';
import {
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PerformanceService } from '../../../src/modules/performance/performance.service';
import { TEAM_ERROR_CODE } from '../../../src/modules/team/team.constant';
import { USER_MANAGEMENT_ERROR_CODE } from '../../../src/modules/user-management/user-management.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const fixedNow = new Date('2026-08-22T10:00:00.000Z');

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

function member(overrides = {}) {
  const value = {
    id: 'member-a',
    name: 'Member A',
    employeeId: 'EMP-001',
    designation: 'Executive',
    status: UserStatus.ACTIVE,
    teamMembership: {
      teamId: 'team-a',
      team: {
        name: 'Team A',
      },
    },
    ...overrides,
  };
  Object.defineProperties(value, {
    publicId: { value: value.id, enumerable: false },
  });
  if (value.teamMembership) {
    Object.defineProperties(value.teamMembership, {
      team: {
        value: {
          ...value.teamMembership.team,
          publicId: value.teamMembership.teamId,
        },
        enumerable: true,
      },
    });
  }
  return value;
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.HIGH,
    dueAt: new Date('2026-08-21T10:00:00.000Z'),
    startedAt: new Date('2026-08-20T10:00:00.000Z'),
    completedAt: new Date('2026-08-20T12:00:00.000Z'),
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

describe('PerformanceService', () => {
  beforeEach(() => {
    jestApi.useFakeTimers().setSystemTime(fixedNow);
  });

  afterEach(() => {
    jestApi.useRealTimers();
  });

  it('lists Super Admin Member performance with team filter and batched metric reads', async () => {
    const prisma = {
      user: {
        findMany: jestApi.fn().mockResolvedValue([member()]),
        count: jestApi.fn().mockResolvedValue(1),
      },
      taskAssignment: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            memberId: 'member-a',
            task: task(),
          },
        ]),
      },
      taskReview: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            submission: {
              submittedById: 'member-a',
              taskId: 'task-a',
            },
          },
        ]),
      },
    };
    const service = new PerformanceService(prisma as never);

    await expect(
      service.listMemberPerformance(createViewer(UserRole.SUPER_ADMIN), {
        teamId: 'team-a',
      }),
    ).resolves.toMatchObject({
      data: [
        {
          member: {
            id: 'member-a',
            teamId: 'team-a',
            teamName: 'Team A',
          },
          performance: {
            totalTasks: 1,
            completedTasks: 1,
            completionRate: 100,
            revisionCount: 1,
            tasksWithRevision: 1,
          },
          workload: {
            activeTasks: 0,
            overdueTasks: 0,
          },
        },
      ],
      metricContext: {
        performanceWindow: 'ALL_TIME',
        asOf: fixedNow,
      },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              role: UserRole.MEMBER,
            },
            {
              teamMembership: {
                team: { publicId: 'team-a' },
              },
            },
          ],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberId: {
            in: ['member-a'],
          },
          unassignedAt: null,
        },
      }) as Record<string, unknown>,
    );
  });

  it('lists Admin scoped Members and forbids Admin team filter', async () => {
    const service = new PerformanceService({} as never);

    try {
      await service.listMemberPerformance(createViewer(UserRole.ADMIN), {
        teamId: 'team-b',
      });
      throw new Error('Expected team filter to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }
  });

  it('forbids Member performance list', async () => {
    const service = new PerformanceService({} as never);

    try {
      await service.listMemberPerformance(createViewer(UserRole.MEMBER), {});
      throw new Error('Expected list to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }
  });

  it('returns empty Member list early without metric queries', async () => {
    const prisma = {
      user: {
        findMany: jestApi.fn().mockResolvedValue([]),
        count: jestApi.fn().mockResolvedValue(0),
      },
      taskAssignment: {
        findMany: jestApi.fn(),
      },
      taskReview: {
        findMany: jestApi.fn(),
      },
    };
    const service = new PerformanceService(prisma as never);

    await expect(
      service.listMemberPerformance(createViewer(UserRole.ADMIN), {}),
    ).resolves.toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
      metricContext: {
        performanceWindow: 'ALL_TIME',
        asOf: fixedNow,
      },
    });
    expect(prisma.taskAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.taskReview.findMany).not.toHaveBeenCalled();
  });

  it('returns Member detail for self and inactive scoped Members', async () => {
    const prisma = {
      user: {
        findFirst: jestApi.fn().mockResolvedValue(
          member({
            status: UserStatus.SUSPENDED,
            teamMembership: null,
          }),
        ),
      },
      taskAssignment: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
      taskReview: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
    };
    const service = new PerformanceService(prisma as never);

    await expect(
      service.getMemberPerformance(createViewer(UserRole.MEMBER), 'member-a'),
    ).resolves.toMatchObject({
      member: {
        id: 'member-a',
        status: UserStatus.SUSPENDED,
        teamId: null,
        teamName: null,
      },
      performance: {
        totalTasks: 0,
        completionRate: null,
      },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: 'member-a',
          AND: [
            {
              id: 'member-a',
              role: UserRole.MEMBER,
            },
          ],
        },
      }),
    );
  });

  it('returns MEMBER_NOT_FOUND for out-of-scope Member detail', async () => {
    const prisma = {
      user: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = new PerformanceService(prisma as never);

    try {
      await service.getMemberPerformance(
        createViewer(UserRole.ADMIN),
        'member-b',
      );
      throw new Error('Expected member lookup to fail.');
    } catch (error) {
      expectAppException(
        error,
        HttpStatus.NOT_FOUND,
        USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
      );
    }
  });

  it('returns Team performance from Team Tasks and independent Team revisions', async () => {
    const prisma = {
      team: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'team-a-db',
          publicId: 'team-a',
          name: 'Team A',
          adminId: 'admin-a-db',
          admin: { publicId: 'admin-a' },
        }),
      },
      teamMember: {
        count: jestApi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValue([
          task({
            id: 'task-pending',
            status: TaskStatus.PENDING,
            priority: TaskPriority.URGENT,
            dueAt: new Date('2026-08-21T10:00:00.000Z'),
          }),
          task({
            id: 'task-complete',
            status: TaskStatus.COMPLETED,
            priority: TaskPriority.HIGH,
          }),
        ]),
      },
      taskReview: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            submission: {
              taskId: 'task-complete',
            },
          },
        ]),
      },
    };
    const service = new PerformanceService(prisma as never);

    await expect(
      service.getTeamPerformance(createViewer(UserRole.ADMIN), 'team-a'),
    ).resolves.toMatchObject({
      team: {
        id: 'team-a',
        name: 'Team A',
        adminId: 'admin-a',
        memberCount: 2,
        activeMemberCount: 1,
      },
      performance: {
        totalTasks: 2,
        completedTasks: 1,
        revisionCount: 1,
        tasksWithRevision: 1,
      },
      workload: {
        activeTasks: 1,
        overdueTasks: 1,
        statusCounts: {
          PENDING: 1,
          COMPLETED: 1,
        },
      },
      metricContext: {
        performanceWindow: 'ALL_TIME',
        asOf: fixedNow,
      },
    });
    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: 'team-a',
          AND: [
            {
              id: {
                in: ['team-a'],
              },
            },
          ],
        },
      }),
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        teamId: 'team-a-db',
      },
      select: expect.anything() as object,
    });
    expect(prisma.taskReview.findMany).toHaveBeenCalledWith({
      where: {
        action: 'REQUEST_REVISION',
        submission: {
          task: {
            teamId: 'team-a-db',
          },
        },
      },
      select: {
        submission: {
          select: {
            taskId: true,
          },
        },
      },
    });
  });

  it('returns TEAM_NOT_FOUND for out-of-scope Team and forbids Member Team performance', async () => {
    const memberService = new PerformanceService({} as never);

    try {
      await memberService.getTeamPerformance(
        createViewer(UserRole.MEMBER),
        'team-a',
      );
      throw new Error('Expected team performance to fail.');
    } catch (error) {
      expectAppException(error, HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }

    const prisma = {
      team: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const adminService = new PerformanceService(prisma as never);

    try {
      await adminService.getTeamPerformance(
        createViewer(UserRole.ADMIN),
        'team-b',
      );
      throw new Error('Expected team lookup to fail.');
    } catch (error) {
      expectAppException(
        error,
        HttpStatus.NOT_FOUND,
        TEAM_ERROR_CODE.TEAM_NOT_FOUND,
      );
    }
  });
});
