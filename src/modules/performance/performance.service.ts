import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskReviewAction,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { TEAM_ERROR_CODE } from '../team/team.constant.js';
import { USER_MANAGEMENT_ERROR_CODE } from '../user-management/user-management.constant.js';
import type { ListMemberPerformanceQueryDto } from './dto/list-member-performance-query.dto.js';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
} from './performance.calculator.js';
import { PERFORMANCE_WINDOW } from './performance.constant.js';
import type {
  MemberPerformanceDetailResponse,
  MemberPerformanceIdentity,
  MemberPerformanceSummary,
  PaginatedMemberPerformanceResponse,
  PerformanceMetricContext,
  PerformanceTaskMetricSource,
  RevisionMetricSource,
  TeamPerformanceResponse,
} from './performance.interface.js';
import {
  performanceMemberSelect,
  performanceTaskSelect,
  performanceTeamSelect,
} from './performance.select.js';
import {
  buildPerformanceMemberScopeWhere,
  buildPerformanceTeamScopeWhere,
} from './policies/performance-scope.policy.js';

type SelectedPerformanceMember = Prisma.UserGetPayload<{
  select: typeof performanceMemberSelect;
}>;

type SelectedPerformanceTask = Prisma.TaskGetPayload<{
  select: typeof performanceTaskSelect;
}>;

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listMemberPerformance(
    viewer: OperixViewer,
    query: ListMemberPerformanceQueryDto,
  ): Promise<PaginatedMemberPerformanceResponse> {
    this.assertMemberListRole(viewer);
    this.assertTeamFilterAllowed(viewer, query.teamId);

    const now = new Date();
    const metricContext = createMetricContext(now);
    const normalized = normalizePagination(query);
    const where = buildMemberListWhere(viewer, query.teamId);

    const [members, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: performanceMemberSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    const memberIds = members.map((member) => member.id);

    if (memberIds.length === 0) {
      return {
        data: [],
        meta: createPaginationMeta({
          page: normalized.page,
          limit: normalized.limit,
          total,
        }),
        metricContext,
      };
    }

    const [tasksByMemberId, revisionsByMemberId] = await Promise.all([
      this.loadCurrentAssignmentTasksByMemberId(memberIds),
      this.loadRevisionsByMemberId(memberIds),
    ]);

    return {
      data: members.map((member) =>
        this.buildMemberSummary(
          member,
          tasksByMemberId.get(member.id) ?? [],
          revisionsByMemberId.get(member.id) ?? [],
          now,
        ),
      ),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
      metricContext,
    };
  }

  async getMemberPerformance(
    viewer: OperixViewer,
    memberId: string,
  ): Promise<MemberPerformanceDetailResponse> {
    const now = new Date();
    const member = await this.prisma.user.findFirst({
      where: {
        id: memberId,
        AND: [buildPerformanceMemberScopeWhere(viewer)],
      },
      select: performanceMemberSelect,
    });

    if (!member) {
      throw memberNotFound();
    }

    const [tasksByMemberId, revisionsByMemberId] = await Promise.all([
      this.loadCurrentAssignmentTasksByMemberId([member.id]),
      this.loadRevisionsByMemberId([member.id]),
    ]);

    return {
      ...this.buildMemberSummary(
        member,
        tasksByMemberId.get(member.id) ?? [],
        revisionsByMemberId.get(member.id) ?? [],
        now,
      ),
      metricContext: createMetricContext(now),
    };
  }

  async getTeamPerformance(
    viewer: OperixViewer,
    teamId: string,
  ): Promise<TeamPerformanceResponse> {
    this.assertTeamPerformanceRole(viewer);

    const now = new Date();
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        AND: [buildPerformanceTeamScopeWhere(viewer)],
      },
      select: performanceTeamSelect,
    });

    if (!team) {
      throw teamNotFound();
    }

    const [memberCount, activeMemberCount, tasks, revisions] =
      await Promise.all([
        this.prisma.teamMember.count({
          where: {
            teamId,
          },
        }),
        this.prisma.teamMember.count({
          where: {
            teamId,
            member: {
              status: UserStatus.ACTIVE,
            },
          },
        }),
        this.prisma.task.findMany({
          where: {
            teamId,
          },
          select: performanceTaskSelect,
        }),
        this.loadTeamRevisions(teamId),
      ]);

    return {
      team: {
        ...team,
        memberCount,
        activeMemberCount,
      },
      performance: calculatePerformanceMetrics(tasks, revisions),
      workload: calculateWorkloadMetrics(tasks, now),
      metricContext: createMetricContext(now),
    };
  }

  private async loadCurrentAssignmentTasksByMemberId(
    memberIds: string[],
  ): Promise<Map<string, PerformanceTaskMetricSource[]>> {
    /*
      Current-assignment attribution is intentional for V1.
      Reassignment performance-credit semantics must be decided before
      Task reassignment is introduced.
    */
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
    const tasksByMemberId = new Map<string, PerformanceTaskMetricSource[]>();

    for (const assignment of assignments) {
      const existing = tasksByMemberId.get(assignment.memberId) ?? [];
      existing.push(assignment.task);
      tasksByMemberId.set(assignment.memberId, existing);
    }

    return tasksByMemberId;
  }

  private async loadRevisionsByMemberId(
    memberIds: string[],
  ): Promise<Map<string, RevisionMetricSource[]>> {
    const reviews = await this.prisma.taskReview.findMany({
      where: {
        action: TaskReviewAction.REQUEST_REVISION,
        submission: {
          submittedById: {
            in: memberIds,
          },
        },
      },
      select: {
        submission: {
          select: {
            submittedById: true,
            taskId: true,
          },
        },
      },
    });
    const revisionsByMemberId = new Map<string, RevisionMetricSource[]>();

    for (const review of reviews) {
      const memberId = review.submission.submittedById;
      const existing = revisionsByMemberId.get(memberId) ?? [];
      existing.push({
        taskId: review.submission.taskId,
      });
      revisionsByMemberId.set(memberId, existing);
    }

    return revisionsByMemberId;
  }

  private async loadTeamRevisions(
    teamId: string,
  ): Promise<RevisionMetricSource[]> {
    const reviews = await this.prisma.taskReview.findMany({
      where: {
        action: TaskReviewAction.REQUEST_REVISION,
        submission: {
          task: {
            teamId,
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

    return reviews.map((review) => ({
      taskId: review.submission.taskId,
    }));
  }

  private buildMemberSummary(
    member: SelectedPerformanceMember,
    tasks: SelectedPerformanceTask[],
    revisions: RevisionMetricSource[],
    now: Date,
  ): MemberPerformanceSummary {
    return {
      member: mapMemberIdentity(member),
      performance: calculatePerformanceMetrics(tasks, revisions),
      workload: calculateWorkloadMetrics(tasks, now),
    };
  }

  private assertMemberListRole(viewer: OperixViewer): void {
    if (viewer.role === UserRole.MEMBER) {
      throw forbidden();
    }
  }

  private assertTeamPerformanceRole(viewer: OperixViewer): void {
    if (viewer.role === UserRole.MEMBER) {
      throw forbidden();
    }
  }

  private assertTeamFilterAllowed(viewer: OperixViewer, teamId?: string): void {
    if (teamId && viewer.role !== UserRole.SUPER_ADMIN) {
      throw forbidden();
    }
  }
}

function buildMemberListWhere(
  viewer: OperixViewer,
  teamId?: string,
): Prisma.UserWhereInput {
  const filters: Prisma.UserWhereInput[] = [
    buildPerformanceMemberScopeWhere(viewer),
  ];

  if (teamId) {
    filters.push({
      teamMembership: {
        teamId,
      },
    });
  }

  return {
    AND: filters,
  };
}

function mapMemberIdentity(
  member: SelectedPerformanceMember,
): MemberPerformanceIdentity {
  return {
    id: member.id,
    name: member.name,
    employeeId: member.employeeId,
    designation: member.designation,
    status: member.status,
    teamId: member.teamMembership?.teamId ?? null,
    teamName: member.teamMembership?.team.name ?? null,
  };
}

function createMetricContext(now: Date): PerformanceMetricContext {
  return {
    performanceWindow: PERFORMANCE_WINDOW.ALL_TIME,
    asOf: now,
  };
}

function forbidden(): AppException {
  return new AppException(
    HttpStatus.FORBIDDEN,
    APP_ERROR_CODE.FORBIDDEN,
    'You do not have access to this resource.',
  );
}

function memberNotFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
    'Member not found.',
  );
}

function teamNotFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    TEAM_ERROR_CODE.TEAM_NOT_FOUND,
    'Team not found.',
  );
}
