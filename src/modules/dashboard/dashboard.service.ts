import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ManagementReportStatus,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationService } from '../notification/notification.service.js';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
} from '../performance/performance.calculator.js';
import { performanceTaskSelect } from '../performance/performance.select.js';
import {
  buildCompletionTrend,
  calculateTaskKpis,
  createEmptyReportStatusCounts,
  createTaskStatusCountsFromTasks,
  isTaskDueSoon,
  startOfUtcTrendWindow,
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
  DashboardTaskMetricSource,
  DashboardTrendsResponse,
  DashboardWorkloadResponse,
  MemberDashboardOverview,
  MemberDashboardWorkload,
  MemberWorkloadRow,
  PaginatedMemberWorkload,
  ReportStatusCounts,
  SuperAdminDashboardOverview,
  SuperAdminDashboardWorkload,
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
  name: true,
  employeeId: true,
  designation: true,
  status: true,
  teamMembership: {
    select: {
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
} as const;

const dashboardTeamSelect = {
  id: true,
  name: true,
  adminId: true,
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
  ) {}

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
    const start = startOfUtcTrendWindow(days, now);
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
      completionTrend: buildCompletionTrend(tasks, days, now),
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
    const start = startOfUtcTrendWindow(days, now);
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
      completionTrend: buildCompletionTrend(tasks, days, now),
      context: this.createContext(viewer, now),
    };
  }

  private async getSuperAdminOverview(
    viewer: OperixViewer,
    now: Date,
  ): Promise<SuperAdminDashboardOverview> {
    const [
      totalAdmins,
      totalMembers,
      tasks,
      reportStatusCounts,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.user.count({ where: { role: UserRole.MEMBER } }),
      this.loadTasksForMetrics({}),
      this.loadReportStatusCounts({}),
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
        pendingManagementReports:
          reportStatusCounts[ManagementReportStatus.SUBMITTED],
        revisionRequiredManagementReports:
          reportStatusCounts[ManagementReportStatus.REVISION_REQUIRED],
        completionRate: kpis.completionRate,
      },
      taskStatusCounts: kpis.statusCounts,
      managementReportStatusCounts: reportStatusCounts,
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
    const [memberRows, tasks] = await Promise.all([
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
    ]);

    return teams.map((team) => {
      const teamMembers = memberRows.filter(
        (member) => member.teamId === team.id,
      );
      const teamTasks = tasks.filter((task) => task.teamId === team.id);
      const workload = calculateWorkloadMetrics(teamTasks, now);

      return {
        teamId: team.id,
        teamName: team.name,
        adminId: team.adminId,
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
    const assignments = await this.prisma.taskAssignment.findMany({
      where: {
        memberId: {
          in: memberIds,
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
    const tasksByMemberId = new Map<string, DashboardTaskMetricSource[]>();

    for (const assignment of assignments) {
      const existing = tasksByMemberId.get(assignment.memberId) ?? [];
      existing.push(assignment.task);
      tasksByMemberId.set(assignment.memberId, existing);
    }

    return members.map((member) => {
      const tasks = tasksByMemberId.get(member.id) ?? [];
      const workload = calculateWorkloadMetrics(tasks, now);

      return {
        memberId: member.id,
        name: member.name,
        employeeId: member.employeeId,
        designation: member.designation,
        status: member.status,
        teamId: member.teamMembership?.teamId ?? null,
        teamName: member.teamMembership?.team.name ?? null,
        activeTasks: workload.activeTasks,
        overdueTasks: workload.overdueTasks,
        statusCounts: workload.statusCounts,
        activePriorityCounts: workload.activePriorityCounts,
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
          memberId,
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
      memberId: member.id,
      name: member.name,
      employeeId: member.employeeId,
      designation: member.designation,
      status: member.status,
      teamId: member.teamMembership?.teamId ?? null,
      teamName: member.teamMembership?.team.name ?? null,
      activeTasks: workload.activeTasks,
      overdueTasks: workload.overdueTasks,
      statusCounts: createTaskStatusCountsFromTasks([]),
      activePriorityCounts: workload.activePriorityCounts,
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
