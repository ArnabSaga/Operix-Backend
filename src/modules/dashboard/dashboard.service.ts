import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ManagementReportStatus,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { getBusinessMonthWindow } from '../../shared/time/business-time.js';
import type { BusinessMonthWindow } from '../../shared/time/business-time.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationService } from '../notification/notification.service.js';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
} from '../performance/performance.calculator.js';
import { performanceTaskSelect } from '../performance/performance.select.js';
import { isTaskOverdue } from '../task/task.mapper.js';
import {
  buildZonedCompletionTrend,
  calculateTaskKpis,
  createEmptyReportStatusCounts,
  createTaskStatusCountsFromTasks,
  isTaskDueSoon,
  startOfZonedTrendWindow,
} from './dashboard.calculator.js';
import {
  DASHBOARD_RECENT_LIMIT,
  DashboardTrendDays,
} from './dashboard.constant.js';
import type {
  AdminDashboardOverview,
  AdminDashboardWorkload,
  DashboardContext,
  DashboardOverviewResponse,
  DashboardOperationalSnapshot,
  DashboardTaskMetricSource,
  DashboardTrendsResponse,
  DashboardWorkloadResponse,
  MemberDashboardOverview,
  MemberDashboardWorkload,
  MemberMonthlyThroughput,
  MemberWorkloadRow,
  PaginatedMemberWorkload,
  ReportStatusCounts,
  SuperAdminDashboardOverview,
  SuperAdminDashboardWorkload,
  TeamMonthlyThroughput,
  TeamWorkloadRow,
} from './dashboard.interface.js';
import type { DashboardTrendQueryDto } from './dto/dashboard-trend-query.dto.js';
import type { DashboardWorkloadQueryDto } from './dto/dashboard-workload-query.dto.js';

const TASK_REVIEW_QUEUE_STATUSES = new Set<TaskStatus>([
  TaskStatus.SUBMITTED,
  TaskStatus.RESUBMITTED,
]);

type DashboardMember = Prisma.UserGetPayload<{
  select: typeof dashboardMemberSelect;
}>;

const dashboardMemberSelect = {
  id: true,
  publicId: true,
  name: true,
  employeeId: true,
  designation: true,
  status: true,
  teamMembership: {
    select: {
      teamId: true,
      team: {
        select: {
          publicId: true,
          name: true,
        },
      },
    },
  },
} as const;

const dashboardTeamSelect = {
  id: true,
  publicId: true,
  name: true,
  adminId: true,
  admin: { select: { publicId: true } },
} as const;

@Injectable()
export class DashboardService {
  private readonly businessTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
    configService: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone = configService.get('app.businessTimezone', {
      infer: true,
    });
  }

  async getOverview(viewer: OperixViewer): Promise<DashboardOverviewResponse> {
    const now = new Date();

    if (viewer.role === UserRole.SUPER_ADMIN) {
      return this.getSuperAdminOverview(viewer, now);
    }

    if (viewer.role === UserRole.ADMIN) {
      return this.getAdminOverview(viewer, now);
    }

    return this.getMemberOverview(viewer, now);
  }

  async getWorkload(
    viewer: OperixViewer,
    query: DashboardWorkloadQueryDto,
  ): Promise<DashboardWorkloadResponse> {
    const now = new Date();

    if (viewer.role === UserRole.SUPER_ADMIN) {
      return this.getSuperAdminWorkload(viewer, query, now);
    }

    if (viewer.role === UserRole.ADMIN) {
      return this.getAdminWorkload(viewer, query, now);
    }

    return this.getMemberWorkload(viewer, now);
  }

  async getTrends(
    viewer: OperixViewer,
    query: DashboardTrendQueryDto,
  ): Promise<DashboardTrendsResponse> {
    const now = new Date();
    const days = query.days ?? DashboardTrendDays.THIRTY;
    const start = startOfZonedTrendWindow(days, now, this.businessTimezone);
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          this.buildTaskScopeWhere(viewer),
          {
            completedAt: {
              gte: start,
              lte: now,
            },
          },
        ],
      },
      select: {
        completedAt: true,
      },
    });

    return {
      role: viewer.role,
      completionTrend: buildZonedCompletionTrend(
        tasks,
        days,
        now,
        this.businessTimezone,
      ),
      context: this.createContext(viewer, now),
    };
  }

  async getWorkloadForExport(
    viewer: OperixViewer,
    now: Date,
    takeMembers: number,
  ): Promise<DashboardWorkloadResponse> {
    if (viewer.role === UserRole.SUPER_ADMIN) {
      const [teams, members] = await Promise.all([
        this.loadTeamWorkloadRows({}, now),
        this.loadAllMemberWorkloadRows(
          {
            role: UserRole.MEMBER,
          },
          now,
          takeMembers,
        ),
      ]);

      return {
        role: viewer.role,
        byTeam: teams,
        byMember: members,
        context: this.createContext(viewer, now),
      };
    }

    if (viewer.role === UserRole.ADMIN) {
      const teamIds = this.getAdminTeamIds(viewer);
      const taskWhere = this.buildAdminTaskWhere(teamIds);
      const [tasks, byMember] = await Promise.all([
        this.loadTasksForMetrics(taskWhere),
        this.loadAllMemberWorkloadRows(
          {
            role: UserRole.MEMBER,
            teamMembership: {
              teamId: {
                in: teamIds,
              },
            },
          },
          now,
          takeMembers,
        ),
      ]);
      const performance = calculatePerformanceMetrics(tasks, []);
      const workload = calculateWorkloadMetrics(tasks, now);

      return {
        role: viewer.role,
        teamSummary: {
          performance: {
            totalTasks: performance.totalTasks,
            eligibleTasks: performance.eligibleTasks,
            completedTasks: performance.completedTasks,
            cancelledTasks: performance.cancelledTasks,
            completionRate: performance.completionRate,
          },
          workload,
          reviewQueueTasks: tasks.filter((task) =>
            TASK_REVIEW_QUEUE_STATUSES.has(task.status),
          ).length,
          revisionRequiredTasks: tasks.filter(
            (task) => task.status === TaskStatus.REVISION_REQUIRED,
          ).length,
        },
        byMember,
        context: this.createContext(viewer, now),
      };
    }

    return this.getMemberWorkload(viewer, now);
  }

  async getTrendsForExport(
    viewer: OperixViewer,
    days: DashboardTrendDays,
    now: Date,
  ): Promise<DashboardTrendsResponse> {
    const start = startOfZonedTrendWindow(days, now, this.businessTimezone);
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          this.buildTaskScopeWhere(viewer),
          {
            completedAt: {
              gte: start,
              lte: now,
            },
          },
        ],
      },
      select: {
        completedAt: true,
      },
    });

    return {
      role: viewer.role,
      completionTrend: buildZonedCompletionTrend(
        tasks,
        days,
        now,
        this.businessTimezone,
      ),
      context: this.createContext(viewer, now),
    };
  }

  async getOperationalSnapshot(
    viewer: OperixViewer,
    days: DashboardTrendDays,
    memberLimit: number,
  ): Promise<DashboardOperationalSnapshot> {
    const now = new Date();

    if (viewer.role === UserRole.SUPER_ADMIN) {
      const [overview, workload, trends] = await Promise.all([
        this.getSuperAdminOverview(viewer, now),
        this.getSuperAdminWorkload(
          viewer,
          { page: 1, limit: memberLimit },
          now,
        ),
        this.getTrendsForExport(viewer, days, now),
      ]);

      return { role: viewer.role, asOf: now, days, overview, workload, trends };
    }

    if (viewer.role === UserRole.ADMIN) {
      const [overview, workload, trends] = await Promise.all([
        this.getAdminOverview(viewer, now),
        this.getAdminWorkload(viewer, { page: 1, limit: memberLimit }, now),
        this.getTrendsForExport(viewer, days, now),
      ]);

      return { role: viewer.role, asOf: now, days, overview, workload, trends };
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this resource.',
    );
  }

  async getAiOperationalSnapshot(
    viewer: OperixViewer,
    days: number,
    memberLimit: number,
    timezone: string,
  ): Promise<DashboardOperationalSnapshot> {
    const now = new Date();
    const periodStart = startOfZonedTrendWindow(days, now, timezone);

    if (viewer.role === UserRole.SUPER_ADMIN) {
      const [overview, workload, resolvedTrends] = await Promise.all([
        this.getSuperAdminOverview(viewer, now),
        this.getSuperAdminWorkload(
          viewer,
          { page: 1, limit: memberLimit },
          now,
        ),
        this.getAiTrends(viewer, days, now, timezone),
      ]);
      return {
        role: viewer.role,
        asOf: now,
        periodStart,
        days,
        overview,
        workload,
        trends: resolvedTrends,
      };
    }

    if (viewer.role === UserRole.ADMIN) {
      const [overview, workload, resolvedTrends] = await Promise.all([
        this.getAdminOverview(viewer, now),
        this.getAdminWorkload(viewer, { page: 1, limit: memberLimit }, now),
        this.getAiTrends(viewer, days, now, timezone),
      ]);
      return {
        role: viewer.role,
        asOf: now,
        periodStart,
        days,
        overview,
        workload,
        trends: resolvedTrends,
      };
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this resource.',
    );
  }

  private async getAiTrends(
    viewer: OperixViewer,
    days: number,
    now: Date,
    timezone: string,
  ): Promise<DashboardTrendsResponse> {
    const start = startOfZonedTrendWindow(days, now, timezone);
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          this.buildTaskScopeWhere(viewer),
          { completedAt: { gte: start, lte: now } },
        ],
      },
      select: { completedAt: true },
    });
    return {
      role: viewer.role,
      completionTrend: buildZonedCompletionTrend(tasks, days, now, timezone),
      context: this.createContext(viewer, now),
    };
  }

  private async getSuperAdminOverview(
    viewer: OperixViewer,
    now: Date,
  ): Promise<SuperAdminDashboardOverview> {
    const monthWindow = getBusinessMonthWindow(now, this.businessTimezone);
    const [
      totalAdmins,
      totalMembers,
      tasks,
      monthlyReportStatusCounts,
      pendingManagementReports,
      revisionRequiredManagementReports,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.user.count({ where: { role: UserRole.MEMBER } }),
      this.loadTasksForMetrics({}),
      this.loadReportStatusCounts({
        createdAt: {
          gte: monthWindow.start,
          lt: monthWindow.endExclusive,
        },
      }),
      this.prisma.managementReport.count({
        where: { status: ManagementReportStatus.SUBMITTED },
      }),
      this.prisma.managementReport.count({
        where: { status: ManagementReportStatus.REVISION_REQUIRED },
      }),
      this.activityService.listPreview(viewer, DASHBOARD_RECENT_LIMIT),
    ]);
    const kpis = calculateTaskKpis(tasks, now);

    return {
      role: viewer.role,
      kpis: {
        totalAdmins,
        totalMembers,
        totalTasks: kpis.totalTasks,
        activeTasks: kpis.activeTasks,
        completedTasks: kpis.completedTasks,
        cancelledTasks: kpis.cancelledTasks,
        overdueTasks: kpis.overdueTasks,
        taskReviewQueue: kpis.reviewQueueTasks,
        revisionRequiredTasks: kpis.revisionRequiredTasks,
        pendingManagementReports,
        revisionRequiredManagementReports,
        completionRate: kpis.completionRate,
      },
      taskStatusCounts: kpis.statusCounts,
      // The breakdown is scoped to the current business month. Pending-review
      // KPIs above stay live so unfinished reports never disappear on the 1st.
      managementReportStatusCounts: monthlyReportStatusCounts,
      recentActivity,
      context: this.createContext(viewer, now),
    };
  }

  private async getAdminOverview(
    viewer: OperixViewer,
    now: Date,
  ): Promise<AdminDashboardOverview> {
    const teamIds = this.getAdminTeamIds(viewer);
    const taskWhere = this.buildAdminTaskWhere(teamIds);
    const [totalMembers, tasks, reportStatusCounts, recentActivity] =
      await Promise.all([
        this.prisma.teamMember.count({
          where: {
            teamId: {
              in: teamIds,
            },
          },
        }),
        this.loadTasksForMetrics(taskWhere),
        this.loadReportStatusCounts({ adminId: viewer.userId }),
        this.activityService.listPreview(viewer, DASHBOARD_RECENT_LIMIT),
      ]);
    const kpis = calculateTaskKpis(tasks, now);

    return {
      role: viewer.role,
      kpis: {
        totalMembers,
        totalTeamTasks: kpis.totalTasks,
        activeTeamTasks: kpis.activeTasks,
        completedTasks: kpis.completedTasks,
        overdueTasks: kpis.overdueTasks,
        reviewQueueTasks: kpis.reviewQueueTasks,
        revisionRequiredTasks: kpis.revisionRequiredTasks,
        dueSoonTasks: tasks.filter((task) => isTaskDueSoon(task, now)).length,
        scopedCompletionRate: kpis.completionRate,
        myDraftReports: reportStatusCounts[ManagementReportStatus.DRAFT],
        mySubmittedReports:
          reportStatusCounts[ManagementReportStatus.SUBMITTED],
        myRevisionRequiredReports:
          reportStatusCounts[ManagementReportStatus.REVISION_REQUIRED],
      },
      taskStatusCounts: kpis.statusCounts,
      recentActivity,
      context: this.createContext(viewer, now),
    };
  }

  private async getMemberOverview(
    viewer: OperixViewer,
    now: Date,
  ): Promise<MemberDashboardOverview> {
    const [tasks, unread, recentNotifications] = await Promise.all([
      this.loadTasksForMetrics(this.buildMemberTaskWhere(viewer.userId)),
      this.notificationService.getUnreadCount(viewer),
      this.notificationService.listPreview(viewer, DASHBOARD_RECENT_LIMIT),
    ]);
    const performance = calculatePerformanceMetrics(tasks, []);
    const workload = calculateWorkloadMetrics(tasks, now);

    return {
      role: viewer.role,
      kpis: {
        myActiveTasks: workload.activeTasks,
        overdueTasks: workload.overdueTasks,
        dueSoonTasks: tasks.filter((task) => isTaskDueSoon(task, now)).length,
        revisionRequiredTasks: tasks.filter(
          (task) => task.status === TaskStatus.REVISION_REQUIRED,
        ).length,
        completedTasks: performance.completedTasks,
        completionRate: performance.completionRate,
        onTimeRate: performance.onTimeRate,
        averageCompletionMinutes: performance.averageCompletionMinutes,
        unreadNotificationCount: unread.count,
      },
      taskStatusCounts: workload.statusCounts,
      recentNotifications,
      context: this.createContext(viewer, now),
    };
  }

  private async getSuperAdminWorkload(
    viewer: OperixViewer,
    query: DashboardWorkloadQueryDto,
    now: Date,
  ): Promise<SuperAdminDashboardWorkload> {
    const [teams, members] = await Promise.all([
      this.loadTeamWorkloadRows({}, now),
      this.loadPaginatedMemberWorkloadRows(
        {
          role: UserRole.MEMBER,
        },
        query,
        now,
      ),
    ]);

    return {
      role: viewer.role,
      byTeam: teams,
      byMember: members,
      context: this.createContext(viewer, now),
    };
  }

  private async getAdminWorkload(
    viewer: OperixViewer,
    query: DashboardWorkloadQueryDto,
    now: Date,
  ): Promise<AdminDashboardWorkload> {
    const teamIds = this.getAdminTeamIds(viewer);
    const taskWhere = this.buildAdminTaskWhere(teamIds);
    const [tasks, byMember] = await Promise.all([
      this.loadTasksForMetrics(taskWhere),
      this.loadPaginatedMemberWorkloadRows(
        {
          role: UserRole.MEMBER,
          teamMembership: {
            teamId: {
              in: teamIds,
            },
          },
        },
        query,
        now,
      ),
    ]);
    const performance = calculatePerformanceMetrics(tasks, []);
    const workload = calculateWorkloadMetrics(tasks, now);

    return {
      role: viewer.role,
      teamSummary: {
        performance: {
          totalTasks: performance.totalTasks,
          eligibleTasks: performance.eligibleTasks,
          completedTasks: performance.completedTasks,
          cancelledTasks: performance.cancelledTasks,
          completionRate: performance.completionRate,
        },
        workload,
        reviewQueueTasks: tasks.filter((task) =>
          TASK_REVIEW_QUEUE_STATUSES.has(task.status),
        ).length,
        revisionRequiredTasks: tasks.filter(
          (task) => task.status === TaskStatus.REVISION_REQUIRED,
        ).length,
      },
      byMember,
      context: this.createContext(viewer, now),
    };
  }

  private async getMemberWorkload(
    viewer: OperixViewer,
    now: Date,
  ): Promise<MemberDashboardWorkload> {
    const member = await this.prisma.user.findUnique({
      where: {
        id: viewer.userId,
      },
      select: dashboardMemberSelect,
    });

    const [self] = await this.buildMemberWorkloadRows(
      member ? [member] : [],
      now,
    );

    return {
      role: viewer.role,
      self:
        self ??
        this.createEmptyMemberWorkload({
          id: viewer.userId,
          publicId: '',
          name: '',
          employeeId: null,
          designation: null,
          status: viewer.status,
          teamMembership: null,
        }),
      context: this.createContext(viewer, now),
    };
  }

  private async loadTeamWorkloadRows(
    where: Prisma.TeamWhereInput,
    now: Date,
  ): Promise<TeamWorkloadRow[]> {
    const teams = await this.prisma.team.findMany({
      where,
      select: dashboardTeamSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    if (teams.length === 0) {
      return [];
    }

    const teamIds = teams.map((team) => team.id);
    const monthWindow = getBusinessMonthWindow(now, this.businessTimezone);
    const [
      memberRows,
      tasks,
      monthlyAssignments,
      monthlyCompletions,
      monthlyReviews,
    ] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: {
          teamId: {
            in: teamIds,
          },
        },
        select: {
          teamId: true,
          member: {
            select: {
              status: true,
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          teamId: {
            in: teamIds,
          },
        },
        select: {
          teamId: true,
          ...performanceTaskSelect,
        },
      }),
      this.prisma.taskAssignment.findMany({
        where: {
          assignedAt: {
            gte: monthWindow.start,
            lt: monthWindow.endExclusive,
          },
          task: {
            teamId: {
              in: teamIds,
            },
          },
        },
        select: {
          task: {
            select: {
              teamId: true,
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          teamId: {
            in: teamIds,
          },
          completedAt: {
            gte: monthWindow.start,
            lt: monthWindow.endExclusive,
          },
        },
        select: {
          teamId: true,
        },
      }),
      this.prisma.taskReview.findMany({
        where: {
          reviewedAt: {
            gte: monthWindow.start,
            lt: monthWindow.endExclusive,
          },
          submission: {
            task: {
              teamId: {
                in: teamIds,
              },
            },
          },
        },
        select: {
          submission: {
            select: {
              task: {
                select: {
                  teamId: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return teams.map((team) => {
      const teamMembers = memberRows.filter(
        (member) => member.teamId === team.id,
      );
      const teamTasks = tasks.filter((task) => task.teamId === team.id);
      const workload = calculateWorkloadMetrics(teamTasks, now);
      const monthly: TeamMonthlyThroughput = {
        assigned: monthlyAssignments.filter(
          (assignment) => assignment.task.teamId === team.id,
        ).length,
        completed: monthlyCompletions.filter((task) => task.teamId === team.id)
          .length,
        reviewsCompleted: monthlyReviews.filter(
          (review) => review.submission.task.teamId === team.id,
        ).length,
      };

      return {
        teamId: team.publicId,
        teamName: team.name,
        adminId: team.admin.publicId,
        memberCount: teamMembers.length,
        activeMemberCount: teamMembers.filter(
          (member) => member.member.status === UserStatus.ACTIVE,
        ).length,
        activeTasks: workload.activeTasks,
        overdueTasks: workload.overdueTasks,
        reviewQueueTasks: teamTasks.filter((task) =>
          TASK_REVIEW_QUEUE_STATUSES.has(task.status),
        ).length,
        revisionRequiredTasks: teamTasks.filter(
          (task) => task.status === TaskStatus.REVISION_REQUIRED,
        ).length,
        statusCounts: workload.statusCounts,
        monthly,
      };
    });
  }

  private async loadPaginatedMemberWorkloadRows(
    where: Prisma.UserWhereInput,
    query: DashboardWorkloadQueryDto,
    now: Date,
  ) {
    const normalized = normalizePagination(query);
    const members = await this.prisma.user.findMany({
      where,
      select: dashboardMemberSelect,
    });
    const rows = await this.buildMemberWorkloadRows(members, now);
    const sorted = rows.sort(compareMemberWorkloadRows);
    const data = sorted.slice(
      normalized.skip,
      normalized.skip + normalized.take,
    );

    return {
      data,
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total: sorted.length,
      }),
    };
  }

  private async loadAllMemberWorkloadRows(
    where: Prisma.UserWhereInput,
    now: Date,
    take: number,
  ): Promise<PaginatedMemberWorkload> {
    const members = await this.prisma.user.findMany({
      where,
      select: dashboardMemberSelect,
      take,
    });
    const rows = await this.buildMemberWorkloadRows(members, now);
    const sorted = rows.sort(compareMemberWorkloadRows);

    return {
      data: sorted,
      meta: createPaginationMeta({
        page: 1,
        limit: sorted.length,
        total: sorted.length,
      }),
    };
  }

  private async buildMemberWorkloadRows(
    members: DashboardMember[],
    now: Date,
  ): Promise<MemberWorkloadRow[]> {
    if (members.length === 0) {
      return [];
    }

    /*
      Current-assignment attribution is intentional for V1.
      Reassignment performance-credit semantics must be decided before
      Task reassignment is introduced.
    */
    const memberIds = members.map((member) => member.id);
    const monthWindow = getBusinessMonthWindow(now, this.businessTimezone);
    const [assignments, monthlyAssignments, monthlyTasks] = await Promise.all([
      this.prisma.taskAssignment.findMany({
        where: {
          responsibleUserId: {
            in: memberIds,
          },
          unassignedAt: null,
        },
        select: {
          responsibleUserId: true,
          task: {
            select: performanceTaskSelect,
          },
        },
      }),
      // Assignment events inside the month, including tasks reassigned away
      // afterwards. Current-state workload below stays live and is unaffected.
      this.prisma.taskAssignment.findMany({
        where: {
          responsibleUserId: {
            in: memberIds,
          },
          assignedAt: {
            gte: monthWindow.start,
            lt: monthWindow.endExclusive,
          },
        },
        select: {
          responsibleUserId: true,
        },
      }),
      this.prisma.task.findMany({
        where: {
          assignments: {
            some: {
              responsibleUserId: {
                in: memberIds,
              },
              unassignedAt: null,
            },
          },
          OR: [
            {
              completedAt: {
                gte: monthWindow.start,
                lt: monthWindow.endExclusive,
              },
            },
            {
              createdAt: {
                gte: monthWindow.start,
                lt: monthWindow.endExclusive,
              },
            },
          ],
        },
        select: {
          createdAt: true,
          completedAt: true,
          dueAt: true,
          status: true,
          assignments: {
            where: {
              unassignedAt: null,
            },
            select: {
              responsibleUserId: true,
            },
          },
        },
      }),
    ]);
    const tasksByMemberId = new Map<string, DashboardTaskMetricSource[]>();

    for (const assignment of assignments) {
      const existing = tasksByMemberId.get(assignment.responsibleUserId) ?? [];
      existing.push(assignment.task);
      tasksByMemberId.set(assignment.responsibleUserId, existing);
    }

    const monthlyByMemberId = buildMemberMonthlyThroughput(
      monthlyTasks,
      monthWindow,
      now,
    );
    const assignedByMemberId = new Map<string, number>();

    for (const assignment of monthlyAssignments) {
      assignedByMemberId.set(
        assignment.responsibleUserId,
        (assignedByMemberId.get(assignment.responsibleUserId) ?? 0) + 1,
      );
    }

    return members.map((member) => {
      const tasks = tasksByMemberId.get(member.id) ?? [];
      const workload = calculateWorkloadMetrics(tasks, now);
      const monthly = monthlyByMemberId.get(member.id) ?? emptyMemberMonthly();

      return {
        memberId: member.publicId,
        name: member.name,
        employeeId: member.employeeId,
        designation: member.designation,
        status: member.status,
        teamId: member.teamMembership?.team.publicId ?? null,
        teamName: member.teamMembership?.team.name ?? null,
        activeTasks: workload.activeTasks,
        overdueTasks: workload.overdueTasks,
        statusCounts: workload.statusCounts,
        activePriorityCounts: workload.activePriorityCounts,
        monthly: {
          ...monthly,
          assigned: assignedByMemberId.get(member.id) ?? 0,
        },
      };
    });
  }

  private async loadTasksForMetrics(
    where: Prisma.TaskWhereInput,
  ): Promise<DashboardTaskMetricSource[]> {
    return this.prisma.task.findMany({
      where,
      select: performanceTaskSelect,
    });
  }

  private async loadReportStatusCounts(
    where: Prisma.ManagementReportWhereInput,
  ): Promise<ReportStatusCounts> {
    const counts = createEmptyReportStatusCounts();
    const rows = await this.prisma.managementReport.groupBy({
      by: ['status'],
      where,
      _count: {
        status: true,
      },
    });

    for (const row of rows) {
      counts[row.status] = row._count.status;
    }

    return counts;
  }

  private buildTaskScopeWhere(viewer: OperixViewer): Prisma.TaskWhereInput {
    if (viewer.role === UserRole.SUPER_ADMIN) {
      return {};
    }

    if (viewer.role === UserRole.ADMIN) {
      return this.buildAdminTaskWhere(this.getAdminTeamIds(viewer));
    }

    return this.buildMemberTaskWhere(viewer.userId);
  }

  private buildAdminTaskWhere(teamIds: string[]): Prisma.TaskWhereInput {
    return {
      teamId: {
        in: teamIds,
      },
    };
  }

  private buildMemberTaskWhere(memberId: string): Prisma.TaskWhereInput {
    return {
      assignments: {
        some: {
          responsibleUserId: memberId,
          unassignedAt: null,
        },
      },
    };
  }

  private getAdminTeamIds(viewer: OperixViewer): string[] {
    return viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [];
  }

  private createContext(viewer: OperixViewer, now: Date): DashboardContext {
    return {
      role: viewer.role,
      asOf: now,
    };
  }

  private createEmptyMemberWorkload(
    member: DashboardMember,
  ): MemberWorkloadRow {
    const workload = calculateWorkloadMetrics([], new Date());

    return {
      memberId: member.publicId,
      name: member.name,
      employeeId: member.employeeId,
      designation: member.designation,
      status: member.status,
      teamId: member.teamMembership?.team.publicId ?? null,
      teamName: member.teamMembership?.team.name ?? null,
      activeTasks: workload.activeTasks,
      overdueTasks: workload.overdueTasks,
      statusCounts: createTaskStatusCountsFromTasks([]),
      activePriorityCounts: workload.activePriorityCounts,
      monthly: emptyMemberMonthly(),
    };
  }
}

function compareMemberWorkloadRows(
  left: MemberWorkloadRow,
  right: MemberWorkloadRow,
): number {
  return (
    right.activeTasks - left.activeTasks ||
    right.overdueTasks - left.overdueTasks ||
    left.name.localeCompare(right.name) ||
    left.memberId.localeCompare(right.memberId)
  );
}

interface MonthlyMemberTaskSource {
  createdAt: Date;
  completedAt: Date | null;
  dueAt: Date | null;
  status: TaskStatus;
  assignments: { responsibleUserId: string }[];
}

function buildMemberMonthlyThroughput(
  tasks: MonthlyMemberTaskSource[],
  window: BusinessMonthWindow,
  now: Date,
): Map<string, MemberMonthlyThroughput> {
  const result = new Map<string, MemberMonthlyThroughput>();

  for (const task of tasks) {
    const completedInWindow =
      task.completedAt !== null &&
      task.completedAt >= window.start &&
      task.completedAt < window.endExclusive;
    const createdInWindow =
      task.createdAt >= window.start && task.createdAt < window.endExclusive;
    const overdueCreated = createdInWindow && isTaskOverdue(task, now);

    for (const assignment of task.assignments) {
      const entry =
        result.get(assignment.responsibleUserId) ?? emptyMemberMonthly();

      if (completedInWindow && task.completedAt !== null) {
        entry.completed += 1;

        if (task.dueAt !== null && task.completedAt <= task.dueAt) {
          entry.onTime += 1;
        }
      }

      if (overdueCreated) {
        entry.overdueCreated += 1;
      }

      result.set(assignment.responsibleUserId, entry);
    }
  }

  return result;
}

function emptyMemberMonthly(): MemberMonthlyThroughput {
  return {
    assigned: 0,
    completed: 0,
    onTime: 0,
    overdueCreated: 0,
  };
}
