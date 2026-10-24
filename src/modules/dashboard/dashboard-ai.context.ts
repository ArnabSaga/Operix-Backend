import {
  ManagementReportStatus,
  UserRole,
} from '../../../generated/prisma/enums.js';
import {
  DASHBOARD_AI_ACTIVITY_LIMIT,
  DASHBOARD_AI_MEMBER_LIMIT,
  DASHBOARD_AI_TEAM_LIMIT,
} from './dashboard-ai.constant.js';
import type {
  DashboardAiContextBuildResult,
  DashboardAiMemberContext,
  DashboardAiTeamContext,
} from './dashboard-ai.interface.js';
import type {
  AdminDashboardOverview,
  AdminDashboardWorkload,
  CompletionTrendPoint,
  DashboardOperationalSnapshot,
  MemberWorkloadRow,
  SuperAdminDashboardOverview,
  SuperAdminDashboardWorkload,
  TeamWorkloadRow,
} from './dashboard.interface.js';

export function buildDashboardAiContext(
  snapshot: DashboardOperationalSnapshot,
): DashboardAiContextBuildResult {
  const limitations: string[] = [];
  const members = getMembers(snapshot.workload);
  const memberRows = members.slice(0, DASHBOARD_AI_MEMBER_LIMIT).map(toMember);

  if (
    members.length > DASHBOARD_AI_MEMBER_LIMIT ||
    snapshot.workload.byMember.meta.total > DASHBOARD_AI_MEMBER_LIMIT
  ) {
    limitations.push(
      `Member workload context was limited to ${DASHBOARD_AI_MEMBER_LIMIT} rows.`,
    );
  }

  const activities = snapshot.overview.recentActivity
    .slice(0, DASHBOARD_AI_ACTIVITY_LIMIT)
    .map((activity) => ({
      action: activity.action,
      entityType: activity.entityType,
      actorName: activity.actor?.name ?? null,
      createdAt: activity.createdAt.toISOString(),
    }));

  if (activities.length === 0) {
    limitations.push(
      'No recent Activity was available in the supplied snapshot.',
    );
  }

  const trend = buildTrendFacts(snapshot.trends.completionTrend);

  if (snapshot.role === UserRole.SUPER_ADMIN) {
    const overview = snapshot.overview as SuperAdminDashboardOverview;
    const workload = snapshot.workload as SuperAdminDashboardWorkload;
    const teams = [...workload.byTeam].sort(compareTeams);
    const teamRows = teams.slice(0, DASHBOARD_AI_TEAM_LIMIT).map(toTeam);

    if (teams.length > DASHBOARD_AI_TEAM_LIMIT) {
      limitations.push(
        `Team workload context was limited to ${DASHBOARD_AI_TEAM_LIMIT} Teams.`,
      );
    }

    return {
      context: {
        role: snapshot.role,
        asOf: snapshot.asOf.toISOString(),
        trendDays: snapshot.days,
        kpis: { ...overview.kpis },
        taskStatusCounts: { ...overview.taskStatusCounts },
        managementReports: {
          statusCounts: { ...overview.managementReportStatusCounts },
        },
        teams: teamRows,
        teamSummary: null,
        members: memberRows,
        completionTrend: trend,
        recentActivity: activities,
      },
      limitations,
    };
  }

  const overview = snapshot.overview as AdminDashboardOverview;
  const workload = snapshot.workload as AdminDashboardWorkload;

  return {
    context: {
      role: snapshot.role,
      asOf: snapshot.asOf.toISOString(),
      trendDays: snapshot.days,
      kpis: { ...overview.kpis },
      taskStatusCounts: { ...overview.taskStatusCounts },
      managementReports: {
        statusCounts: {
          [ManagementReportStatus.DRAFT]: overview.kpis.myDraftReports,
          [ManagementReportStatus.SUBMITTED]: overview.kpis.mySubmittedReports,
          [ManagementReportStatus.REVISION_REQUIRED]:
            overview.kpis.myRevisionRequiredReports,
        },
      },
      teams: [],
      teamSummary: {
        activeTasks: workload.teamSummary.workload.activeTasks,
        overdueTasks: workload.teamSummary.workload.overdueTasks,
        reviewQueueTasks: workload.teamSummary.reviewQueueTasks,
        revisionRequiredTasks: workload.teamSummary.revisionRequiredTasks,
        statusCounts: { ...workload.teamSummary.workload.statusCounts },
      },
      members: memberRows,
      completionTrend: trend,
      recentActivity: activities,
    },
    limitations,
  };
}

function getMembers(
  workload: SuperAdminDashboardWorkload | AdminDashboardWorkload,
): MemberWorkloadRow[] {
  return [...workload.byMember.data].sort(
    (left, right) =>
      right.activeTasks - left.activeTasks ||
      right.overdueTasks - left.overdueTasks ||
      left.name.localeCompare(right.name),
  );
}

function toMember(member: MemberWorkloadRow): DashboardAiMemberContext {
  return {
    name: member.name,
    teamName: member.teamName,
    activeTasks: member.activeTasks,
    overdueTasks: member.overdueTasks,
    statusCounts: { ...member.statusCounts },
    activePriorityCounts: { ...member.activePriorityCounts },
  };
}

function compareTeams(left: TeamWorkloadRow, right: TeamWorkloadRow): number {
  return (
    right.overdueTasks - left.overdueTasks ||
    right.reviewQueueTasks - left.reviewQueueTasks ||
    right.revisionRequiredTasks - left.revisionRequiredTasks ||
    right.activeTasks - left.activeTasks ||
    left.teamName.localeCompare(right.teamName)
  );
}

function toTeam(team: TeamWorkloadRow): DashboardAiTeamContext {
  return {
    name: team.teamName,
    activeMembers: team.activeMemberCount,
    activeTasks: team.activeTasks,
    overdueTasks: team.overdueTasks,
    reviewQueueTasks: team.reviewQueueTasks,
    revisionRequiredTasks: team.revisionRequiredTasks,
  };
}

function buildTrendFacts(points: CompletionTrendPoint[]) {
  const completedInWindow = sum(points);
  const recent = points.slice(-7);
  const previous = points.length >= 14 ? points.slice(-14, -7) : null;
  const peakDay = points.reduce<CompletionTrendPoint | null>((peak, point) => {
    if (peak === null || point.completedTasks > peak.completedTasks) {
      return point;
    }
    return peak;
  }, null);

  return {
    points: points.map((point) => ({ ...point })),
    completedInWindow,
    recent7DayCompleted: sum(recent),
    previous7DayCompleted: previous ? sum(previous) : null,
    peakDay,
    zeroCompletionDays: points.filter((point) => point.completedTasks === 0)
      .length,
  };
}

function sum(points: CompletionTrendPoint[]): number {
  return points.reduce((total, point) => total + point.completedTasks, 0);
}
