import { UserRole } from '../../../generated/prisma/enums';
import { buildDashboardAiContext } from '../../../src/modules/dashboard/dashboard-ai.context';
import { DashboardTrendDays } from '../../../src/modules/dashboard/dashboard.constant';
import type { DashboardOperationalSnapshot } from '../../../src/modules/dashboard/dashboard.interface';

function snapshot(): DashboardOperationalSnapshot {
  const statusCounts = {
    PENDING: 1,
    ASSIGNED: 0,
    IN_PROGRESS: 0,
    SUBMITTED: 0,
    UNDER_REVIEW: 0,
    COMPLETED: 1,
    REVISION_REQUIRED: 0,
    RESUBMITTED: 0,
    CANCELLED: 0,
  };
  const priorityCounts = { LOW: 0, MEDIUM: 1, HIGH: 0, URGENT: 0 };
  const members = Array.from({ length: 12 }, (_, index) => ({
    memberId: `private-public-id-${index}`,
    name: `Member ${index}`,
    employeeId: `EMP-${index}`,
    designation: 'Officer',
    status: 'ACTIVE' as const,
    teamId: 'team-private-id',
    teamName: 'Quality',
    activeTasks: 12 - index,
    overdueTasks: index,
    statusCounts,
    activePriorityCounts: priorityCounts,
  }));

  return {
    role: UserRole.SUPER_ADMIN,
    asOf: new Date('2026-10-24T08:00:00.000Z'),
    days: DashboardTrendDays.THIRTY,
    overview: {
      role: UserRole.SUPER_ADMIN,
      kpis: {
        totalAdmins: 2,
        totalMembers: 12,
        totalTasks: 10,
        activeTasks: 7,
        completedTasks: 2,
        cancelledTasks: 1,
        overdueTasks: 7,
        taskReviewQueue: 3,
        revisionRequiredTasks: 1,
        pendingManagementReports: 2,
        revisionRequiredManagementReports: 1,
        completionRate: 82,
      },
      taskStatusCounts: statusCounts,
      managementReportStatusCounts: {
        DRAFT: 0,
        SUBMITTED: 2,
        UNDER_REVIEW: 0,
        REVISION_REQUIRED: 1,
        APPROVED: 0,
      },
      recentActivity: [
        {
          id: 'activity-private-id',
          action: 'TASK_COMPLETED',
          entityType: 'TASK',
          entityId: 'task-private-id',
          createdAt: new Date('2026-10-24T07:00:00.000Z'),
          metadata: { description: 'secret task description' },
          actor: { id: 'actor-private-id', name: 'Admin A' },
        },
      ],
      context: {
        role: UserRole.SUPER_ADMIN,
        asOf: new Date('2026-10-24T08:00:00.000Z'),
      },
    },
    workload: {
      role: UserRole.SUPER_ADMIN,
      byTeam: Array.from({ length: 12 }, (_, index) => ({
        teamId: `team-id-${index}`,
        teamName: `Team ${index}`,
        adminId: `admin-id-${index}`,
        memberCount: 2,
        activeMemberCount: 2,
        activeTasks: index,
        overdueTasks: index,
        reviewQueueTasks: 0,
        revisionRequiredTasks: 0,
        statusCounts,
      })),
      byMember: {
        data: members,
        meta: { page: 1, limit: 10, total: 12, totalPages: 2 },
      },
      context: {
        role: UserRole.SUPER_ADMIN,
        asOf: new Date('2026-10-24T08:00:00.000Z'),
      },
    },
    trends: {
      role: UserRole.SUPER_ADMIN,
      completionTrend: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-10-${String(index + 1).padStart(2, '0')}`,
        completedTasks: index === 29 ? 5 : 0,
      })),
      context: {
        role: UserRole.SUPER_ADMIN,
        asOf: new Date('2026-10-24T08:00:00.000Z'),
      },
    },
  };
}

describe('buildDashboardAiContext', () => {
  it('preserves authoritative metrics and computes trend facts deterministically', () => {
    const built = buildDashboardAiContext(snapshot());
    expect(built.context.kpis).toMatchObject({
      overdueTasks: 7,
      completionRate: 82,
    });
    expect(built.context.completionTrend).toMatchObject({
      completedInWindow: 5,
      recent7DayCompleted: 5,
      previous7DayCompleted: 0,
      zeroCompletionDays: 29,
      peakDay: { date: '2026-10-30', completedTasks: 5 },
    });
  });

  it('caps Team and Member context and adds deterministic limitations', () => {
    const built = buildDashboardAiContext(snapshot());
    expect(built.context.teams).toHaveLength(10);
    expect(built.context.members).toHaveLength(10);
    expect(built.limitations).toEqual(
      expect.arrayContaining([
        'Member workload context was limited to 10 rows.',
        'Team workload context was limited to 10 Teams.',
      ]),
    );
  });

  it('removes private ids, employee fields, descriptions, and Activity metadata', () => {
    const serialized = JSON.stringify(
      buildDashboardAiContext(snapshot()).context,
    );
    expect(serialized).not.toContain('private-id');
    expect(serialized).not.toContain('EMP-');
    expect(serialized).not.toContain('Officer');
    expect(serialized).not.toContain('secret task description');
    expect(serialized).not.toContain('metadata');
    expect(serialized).toContain('Admin A');
  });
});
