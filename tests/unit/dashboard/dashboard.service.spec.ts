import {
  ManagementReportStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { DashboardService } from '../../../src/modules/dashboard/dashboard.service';
import { performanceTaskSelect } from '../../../src/modules/performance/performance.select';
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
          ? { type: 'ADMIN', teamIds: ['team-a', 'team-c'] }
          : { type: 'MEMBER', teamId: 'team-a' },
  };
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
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
    Object.defineProperty(value.teamMembership.team, 'publicId', {
      value: value.teamMembership.teamId,
      enumerable: false,
    });
  }
  return value;
}

function createService(prismaOverrides = {}) {
  const prisma = {
    user: {
      count: jestApi.fn().mockResolvedValue(0),
      findMany: jestApi.fn().mockResolvedValue([]),
      findUnique: jestApi.fn().mockResolvedValue(member()),
    },
    task: {
      findMany: jestApi.fn().mockResolvedValue([]),
    },
    managementReport: {
      groupBy: jestApi.fn().mockResolvedValue([]),
    },
    teamMember: {
      count: jestApi.fn().mockResolvedValue(0),
      findMany: jestApi.fn().mockResolvedValue([]),
    },
    team: {
      findMany: jestApi.fn().mockResolvedValue([]),
    },
    taskAssignment: {
      findMany: jestApi.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  };
  const activityService = {
    listPreview: jestApi.fn().mockResolvedValue([{ id: 'activity-a' }]),
  };
  const notificationService = {
    getUnreadCount: jestApi.fn().mockResolvedValue({ count: 3 }),
    listPreview: jestApi.fn().mockResolvedValue([{ id: 'notification-a' }]),
  };

  return {
    prisma,
    activityService,
    notificationService,
    service: new DashboardService(
      prisma as never,
      activityService as never,
      notificationService as never,
    ),
  };
}

describe('DashboardService', () => {
  beforeEach(() => {
    jestApi.useFakeTimers().setSystemTime(fixedNow);
  });

  afterEach(() => {
    jestApi.useRealTimers();
  });

  it('builds Super Admin overview from global data and zero-filled report statuses', async () => {
    const { service, prisma, activityService } = createService({
      user: {
        count: jestApi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(10),
        findMany: jestApi.fn(),
        findUnique: jestApi.fn(),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValue([
          task({
            id: 'completed',
            status: TaskStatus.COMPLETED,
            completedAt: new Date('2026-08-21T10:00:00.000Z'),
          }),
          task({
            id: 'overdue',
            status: TaskStatus.SUBMITTED,
            dueAt: new Date('2026-08-21T10:00:00.000Z'),
          }),
          task({ id: 'revision', status: TaskStatus.REVISION_REQUIRED }),
          task({ id: 'cancelled', status: TaskStatus.CANCELLED }),
        ]),
      },
      managementReport: {
        groupBy: jestApi.fn().mockResolvedValue([
          {
            status: ManagementReportStatus.SUBMITTED,
            _count: { status: 3 },
          },
          {
            status: ManagementReportStatus.REVISION_REQUIRED,
            _count: { status: 1 },
          },
        ]),
      },
    });

    await expect(
      service.getOverview(createViewer(UserRole.SUPER_ADMIN)),
    ).resolves.toMatchObject({
      role: UserRole.SUPER_ADMIN,
      kpis: {
        totalAdmins: 2,
        totalMembers: 10,
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
        cancelledTasks: 1,
        overdueTasks: 1,
        taskReviewQueue: 1,
        revisionRequiredTasks: 1,
        pendingManagementReports: 3,
        revisionRequiredManagementReports: 1,
        completionRate: 33.33,
      },
      taskStatusCounts: {
        COMPLETED: 1,
        SUBMITTED: 1,
        REVISION_REQUIRED: 1,
        CANCELLED: 1,
      },
      managementReportStatusCounts: {
        DRAFT: 0,
        SUBMITTED: 3,
        UNDER_REVIEW: 0,
        REVISION_REQUIRED: 1,
        APPROVED: 0,
      },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {},
      select: performanceTaskSelect,
    });
    expect(activityService.listPreview).toHaveBeenCalledWith(
      createViewer(UserRole.SUPER_ADMIN),
      5,
    );
  });

  it('keeps Admin Task scope and authored Report counters separate', async () => {
    const { service, prisma } = createService({
      task: {
        findMany: jestApi.fn().mockResolvedValue([
          task({
            status: TaskStatus.IN_PROGRESS,
            dueAt: new Date('2026-08-23T10:00:00.000Z'),
          }),
        ]),
      },
      managementReport: {
        groupBy: jestApi.fn().mockResolvedValue([
          {
            status: ManagementReportStatus.DRAFT,
            _count: { status: 2 },
          },
        ]),
      },
      teamMember: {
        count: jestApi.fn().mockResolvedValue(5),
        findMany: jestApi.fn(),
      },
    });

    await expect(
      service.getOverview(createViewer(UserRole.ADMIN)),
    ).resolves.toMatchObject({
      role: UserRole.ADMIN,
      kpis: {
        totalMembers: 5,
        totalTeamTasks: 1,
        activeTeamTasks: 1,
        dueSoonTasks: 1,
        myDraftReports: 2,
      },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        teamId: {
          in: ['team-a', 'team-c'],
        },
      },
      select: performanceTaskSelect,
    });
    expect(prisma.managementReport.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        adminId: 'admin-a',
      },
      _count: {
        status: true,
      },
    });
  });

  it('builds Member overview from current assignments and own notifications', async () => {
    const { service, prisma, notificationService } = createService({
      task: {
        findMany: jestApi.fn().mockResolvedValue([
          task({
            id: 'active',
            status: TaskStatus.REVISION_REQUIRED,
            dueAt: new Date('2026-08-23T10:00:00.000Z'),
          }),
          task({
            id: 'completed',
            status: TaskStatus.COMPLETED,
            startedAt: new Date('2026-08-21T10:00:00.000Z'),
            completedAt: new Date('2026-08-21T12:00:00.000Z'),
          }),
        ]),
      },
    });

    await expect(
      service.getOverview(createViewer(UserRole.MEMBER)),
    ).resolves.toMatchObject({
      role: UserRole.MEMBER,
      kpis: {
        myActiveTasks: 1,
        dueSoonTasks: 1,
        revisionRequiredTasks: 1,
        completedTasks: 1,
        completionRate: 50,
        averageCompletionMinutes: 120,
        unreadNotificationCount: 3,
      },
      recentNotifications: [{ id: 'notification-a' }],
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        assignments: {
          some: {
            memberId: 'member-a',
            unassignedAt: null,
          },
        },
      },
      select: performanceTaskSelect,
    });
    expect(notificationService.getUnreadCount).toHaveBeenCalled();
    expect(notificationService.listPreview).toHaveBeenCalled();
  });

  it('calculates, sorts, then paginates Member workload rows', async () => {
    const { service, prisma } = createService({
      user: {
        count: jestApi.fn(),
        findUnique: jestApi.fn(),
        findMany: jestApi
          .fn()
          .mockResolvedValue([
            member({ id: 'member-low', name: 'Low' }),
            member({ id: 'member-high', name: 'High' }),
            member({ id: 'member-mid', name: 'Mid' }),
          ]),
      },
      taskAssignment: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            memberId: 'member-low',
            task: task({ id: 'low-1', status: TaskStatus.IN_PROGRESS }),
          },
          {
            memberId: 'member-high',
            task: task({ id: 'high-1', status: TaskStatus.IN_PROGRESS }),
          },
          {
            memberId: 'member-high',
            task: task({
              id: 'high-2',
              status: TaskStatus.SUBMITTED,
              dueAt: new Date('2026-08-21T10:00:00.000Z'),
            }),
          },
          {
            memberId: 'member-mid',
            task: task({ id: 'mid-1', status: TaskStatus.IN_PROGRESS }),
          },
          {
            memberId: 'member-mid',
            task: task({ id: 'mid-2', status: TaskStatus.IN_PROGRESS }),
          },
        ]),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.getWorkload(createViewer(UserRole.SUPER_ADMIN), {
        page: 1,
        limit: 2,
      }),
    ).resolves.toMatchObject({
      byMember: {
        data: [
          { memberId: 'member-high', activeTasks: 2, overdueTasks: 1 },
          { memberId: 'member-mid', activeTasks: 2, overdueTasks: 0 },
        ],
        meta: {
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2,
        },
      },
    });
    expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith({
      where: {
        memberId: {
          in: ['member-low', 'member-high', 'member-mid'],
        },
        unassignedAt: null,
      },
      select: {
        memberId: true,
        task: {
          select: performanceTaskSelect,
        },
      },
    });
  });

  it('derives Admin teamSummary from combined scoped Tasks', async () => {
    const { service, prisma } = createService({
      task: {
        findMany: jestApi
          .fn()
          .mockResolvedValue([
            task({ id: 'pending', status: TaskStatus.PENDING }),
            task({ id: 'completed', status: TaskStatus.COMPLETED }),
          ]),
      },
      user: {
        count: jestApi.fn(),
        findUnique: jestApi.fn(),
        findMany: jestApi.fn().mockResolvedValue([]),
      },
      taskAssignment: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.getWorkload(createViewer(UserRole.ADMIN), {}),
    ).resolves.toMatchObject({
      teamSummary: {
        performance: {
          totalTasks: 2,
          completedTasks: 1,
          completionRate: 50,
        },
        workload: {
          activeTasks: 1,
        },
      },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        teamId: {
          in: ['team-a', 'team-c'],
        },
      },
      select: performanceTaskSelect,
    });
  });

  it('builds Super Admin Team workload directly from Task.teamId', async () => {
    const { service } = createService({
      team: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            id: 'team-a',
            publicId: 'team-a',
            name: 'Alpha',
            adminId: 'admin-a',
            admin: { publicId: 'admin-a' },
          },
        ]),
      },
      teamMember: {
        findMany: jestApi.fn().mockResolvedValue([
          { teamId: 'team-a', member: { status: UserStatus.ACTIVE } },
          { teamId: 'team-a', member: { status: UserStatus.SUSPENDED } },
        ]),
        count: jestApi.fn(),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            teamId: 'team-a',
            ...task({ id: 'pending', status: TaskStatus.PENDING }),
          },
        ]),
      },
      user: {
        count: jestApi.fn(),
        findUnique: jestApi.fn(),
        findMany: jestApi.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.getWorkload(createViewer(UserRole.SUPER_ADMIN), {}),
    ).resolves.toMatchObject({
      byTeam: [
        {
          teamId: 'team-a',
          teamName: 'Alpha',
          memberCount: 2,
          activeMemberCount: 1,
          activeTasks: 1,
          statusCounts: {
            PENDING: 1,
          },
        },
      ],
    });
  });

  it('uses UTC zero-filled trend buckets and current-assignment Member scope', async () => {
    const { service, prisma } = createService({
      task: {
        findMany: jestApi
          .fn()
          .mockResolvedValue([
            { completedAt: new Date('2026-08-16T00:01:00.000Z') },
            { completedAt: new Date('2026-08-18T00:01:00.000Z') },
          ]),
      },
    });

    await expect(
      service.getTrends(createViewer(UserRole.MEMBER), { days: 7 }),
    ).resolves.toMatchObject({
      role: UserRole.MEMBER,
      completionTrend: [
        { date: '2026-08-16', completedTasks: 1 },
        { date: '2026-08-17', completedTasks: 0 },
        { date: '2026-08-18', completedTasks: 1 },
        { date: '2026-08-19', completedTasks: 0 },
        { date: '2026-08-20', completedTasks: 0 },
        { date: '2026-08-21', completedTasks: 0 },
        { date: '2026-08-22', completedTasks: 0 },
      ],
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            assignments: {
              some: {
                memberId: 'member-a',
                unassignedAt: null,
              },
            },
          },
          {
            completedAt: {
              gte: new Date('2026-08-16T00:00:00.000Z'),
              lte: fixedNow,
            },
          },
        ],
      },
      select: {
        completedAt: true,
      },
    });
  });
});
