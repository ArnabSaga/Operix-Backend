import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import type { AiService } from '../../../src/shared/ai/ai.service';
import type {
  AiGenerationRequest,
  AiGenerationResult,
} from '../../../src/shared/ai/ai.interface';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import { DashboardAiService } from '../../../src/modules/dashboard/dashboard-ai.service';
import { DashboardTrendDays } from '../../../src/modules/dashboard/dashboard.constant';
import type { DashboardOperationalSnapshot } from '../../../src/modules/dashboard/dashboard.interface';
import type { DashboardService } from '../../../src/modules/dashboard/dashboard.service';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;
const MODEL = 'gemini-3.1-flash-lite';

function validBriefJson(): string {
  return JSON.stringify({
    headline: 'Overdue work needs attention',
    executiveSummary:
      'Seven overdue Tasks are present in the authorized snapshot.',
    priorities: [
      {
        severity: 'HIGH',
        category: 'OVERDUE',
        title: 'Review overdue Tasks',
        evidence: 'The Dashboard reports seven overdue Tasks.',
        suggestedAction: 'Review the oldest overdue Tasks first.',
      },
    ],
    workloadObservations: [],
    trendSummary: 'Two Tasks were completed in the selected window.',
    reportingSummary: null,
    nextActions: ['Review overdue work.'],
    confidence: 'HIGH',
    limitations: ['Only supplied metrics were considered.'],
  });
}

function viewer(role: UserRole): OperixViewer {
  return {
    userId: `${role.toLowerCase()}-private-id`,
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.ADMIN
        ? { type: 'ADMIN', teamIds: ['team-private-id'] }
        : { type: 'GLOBAL' },
  };
}

function snapshot(): DashboardOperationalSnapshot {
  const statusCounts = {
    PENDING: 0,
    ASSIGNED: 0,
    IN_PROGRESS: 7,
    SUBMITTED: 0,
    UNDER_REVIEW: 0,
    COMPLETED: 2,
    REVISION_REQUIRED: 0,
    RESUBMITTED: 0,
    CANCELLED: 0,
  };
  const now = new Date('2026-10-24T08:00:00.000Z');
  return {
    role: UserRole.ADMIN,
    asOf: now,
    days: DashboardTrendDays.SEVEN,
    overview: {
      role: UserRole.ADMIN,
      kpis: {
        totalMembers: 2,
        totalTeamTasks: 9,
        activeTeamTasks: 7,
        completedTasks: 2,
        overdueTasks: 7,
        reviewQueueTasks: 0,
        revisionRequiredTasks: 0,
        dueSoonTasks: 1,
        scopedCompletionRate: 82,
        myDraftReports: 1,
        mySubmittedReports: 0,
        myRevisionRequiredReports: 0,
      },
      taskStatusCounts: statusCounts,
      recentActivity: [],
      context: { role: UserRole.ADMIN, asOf: now },
    },
    workload: {
      role: UserRole.ADMIN,
      teamSummary: {
        performance: {
          totalTasks: 9,
          eligibleTasks: 9,
          completedTasks: 2,
          cancelledTasks: 0,
          completionRate: 82,
        },
        workload: {
          activeTasks: 7,
          overdueTasks: 7,
          statusCounts,
          activePriorityCounts: { LOW: 0, MEDIUM: 7, HIGH: 0, URGENT: 0 },
        },
        reviewQueueTasks: 0,
        revisionRequiredTasks: 0,
      },
      byMember: {
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
      context: { role: UserRole.ADMIN, asOf: now },
    },
    trends: {
      role: UserRole.ADMIN,
      completionTrend: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-10-${String(index + 18).padStart(2, '0')}`,
        completedTasks: index === 6 ? 2 : 0,
      })),
      context: { role: UserRole.ADMIN, asOf: now },
    },
  };
}

interface Harness {
  service: DashboardAiService;
  getOperationalSnapshot: jest.Mock;
  generate: jest.Mock<Promise<AiGenerationResult>, [AiGenerationRequest]>;
  assertEnabled: jest.Mock;
}

function harness(): Harness {
  const getOperationalSnapshot = jestApi.fn().mockResolvedValue(snapshot());
  const generate = jestApi
    .fn<Promise<AiGenerationResult>, [AiGenerationRequest]>()
    .mockResolvedValue({ text: validBriefJson(), model: MODEL });
  const assertEnabled = jestApi.fn();
  const dashboardService = {
    getOperationalSnapshot,
  } as unknown as DashboardService;
  const aiService = {
    assertEnabled,
    getTimeoutMs: jestApi.fn().mockReturnValue(30_000),
    getProviderName: jestApi.fn().mockReturnValue('gemini'),
    generate,
  } as unknown as AiService;
  return {
    service: new DashboardAiService(dashboardService, aiService),
    getOperationalSnapshot,
    generate,
    assertEnabled,
  };
}

afterEach(() => jestApi.restoreAllMocks());

describe('DashboardAiService authorization and context', () => {
  it('denies Members before availability, snapshot, or provider work', async () => {
    const test = harness();
    await expect(
      test.service.generate(viewer(UserRole.MEMBER)),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });
    expect(test.assertEnabled).not.toHaveBeenCalled();
    expect(test.getOperationalSnapshot).not.toHaveBeenCalled();
    expect(test.generate).not.toHaveBeenCalled();
  });

  it('uses the canonical snapshot and sends exact deterministic metrics', async () => {
    const test = harness();
    const result = await test.service.generate(
      viewer(UserRole.ADMIN),
      DashboardTrendDays.SEVEN,
    );
    expect(test.getOperationalSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.ADMIN }),
      DashboardTrendDays.SEVEN,
      10,
    );
    const request = test.generate.mock.calls[0]![0];
    expect(request.userPrompt).toContain('"overdueTasks": 7');
    expect(request.userPrompt).toContain('"scopedCompletionRate": 82');
    expect(request.userPrompt).not.toContain('private-id');
    expect(request.userPrompt).not.toContain('metadata');
    expect(result.meta).toMatchObject({
      provider: 'gemini',
      model: MODEL,
      attempts: 1,
      days: 7,
      asOf: '2026-10-24T08:00:00.000Z',
    });
    expect(result.limitations.slice(0, 2)).toEqual([
      'This is an advisory AI summary of the current authorized Operix Dashboard snapshot.',
      'The brief does not change Tasks, Reviews, Reports, assignments, or workflow state.',
    ]);
  });
});

describe('DashboardAiService retry contract', () => {
  it('uses one provider call for valid output', async () => {
    const test = harness();
    await test.service.generate(viewer(UserRole.SUPER_ADMIN));
    expect(test.generate).toHaveBeenCalledTimes(1);
  });

  it('retries invalid structured output once', async () => {
    const test = harness();
    test.generate
      .mockResolvedValueOnce({ text: '{}', model: MODEL })
      .mockResolvedValueOnce({ text: validBriefJson(), model: MODEL });
    const result = await test.service.generate(viewer(UserRole.ADMIN));
    expect(test.generate).toHaveBeenCalledTimes(2);
    expect(result.meta.attempts).toBe(2);
  });

  it('returns AI_RESPONSE_INVALID after two unusable responses', async () => {
    const test = harness();
    test.generate.mockResolvedValue({ text: '{}', model: MODEL });
    await expect(
      test.service.generate(viewer(UserRole.ADMIN)),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { code: APP_ERROR_CODE.AI_RESPONSE_INVALID },
    });
    expect(test.generate).toHaveBeenCalledTimes(2);
  });

  it.each([
    [HttpStatus.TOO_MANY_REQUESTS, APP_ERROR_CODE.AI_RATE_LIMITED],
    [HttpStatus.SERVICE_UNAVAILABLE, APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE],
  ])('does not retry provider failures', async (status, code) => {
    const test = harness();
    test.generate.mockRejectedValue(
      new AppException(status, code, 'provider failure'),
    );
    await expect(
      test.service.generate(viewer(UserRole.ADMIN)),
    ).rejects.toMatchObject({ status, response: { code } });
    expect(test.generate).toHaveBeenCalledTimes(1);
  });
});
