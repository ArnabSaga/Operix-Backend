import { HttpStatus } from '@nestjs/common';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { TaskAssignmentAiService } from '../../../src/modules/task/task-assignment-ai.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import type {
  AiGenerationRequest,
  AiGenerationResult,
} from '../../../src/shared/ai/ai.interface';
import type { AiService } from '../../../src/shared/ai/ai.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;
const MODEL = 'gemini-test';

function viewer(role: UserRole = UserRole.ADMIN): OperixViewer {
  return {
    userId: role === UserRole.SUPER_ADMIN ? 'chief-db' : 'admin-db',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.ADMIN
        ? { type: 'ADMIN', teamIds: ['team-public'] }
        : { type: 'GLOBAL' },
  };
}

function assignableTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-db',
    publicId: '10000000-0000-4000-8000-000000000001',
    referenceCode: 'TASK-1',
    title: 'Review monthly quality records',
    description: 'Compare the monthly records.',
    remarks: null,
    priority: TaskPriority.HIGH,
    dueAt: new Date('2026-11-01T09:00:00.000Z'),
    status: TaskStatus.PENDING,
    scope: TaskScope.TEAM,
    createdById: 'admin-db',
    completionMode: TaskCompletionMode.REVIEW_REQUIRED,
    team: { name: 'Quality' },
    category: { id: 'category-db', name: 'Quality records' },
    assignments: [],
    ...overrides,
  };
}

function member(index: number) {
  return {
    id: `member-${index}-db`,
    publicId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Member ${index}`,
    designation: 'Executive',
    teamMembership: { team: { name: 'Quality' } },
  };
}

function validResponse(candidateRef = 'C01') {
  return JSON.stringify({
    summary: 'A balanced recommendation based on supplied Operix metrics.',
    decision: 'RECOMMEND',
    recommendations: [
      {
        candidateRef,
        rationale: 'The candidate has low current and overdue workload.',
        strengths: ['No overdue Tasks'],
        cautions: ['Availability is not modeled'],
      },
    ],
    confidence: 'MEDIUM',
    limitations: [],
  });
}

function harness(options: { task?: unknown; members?: unknown[] } = {}) {
  const prisma = {
    task: {
      findFirst: jestApi
        .fn()
        .mockResolvedValue(options.task ?? assignableTask()),
    },
    user: {
      findMany: jestApi.fn().mockResolvedValue(options.members ?? [member(1)]),
    },
    taskAssignment: {
      findMany: jestApi.fn().mockResolvedValue([
        {
          responsibleUserId: 'member-1-db',
          task: {
            id: 'history-task',
            status: TaskStatus.COMPLETED,
            priority: TaskPriority.HIGH,
            dueAt: new Date('2026-10-01T10:00:00.000Z'),
            startedAt: new Date('2026-10-01T08:00:00.000Z'),
            completedAt: new Date('2026-10-01T09:00:00.000Z'),
            categoryId: 'category-db',
          },
        },
      ]),
    },
    taskReview: { findMany: jestApi.fn().mockResolvedValue([]) },
  };
  const generate = jestApi
    .fn<Promise<AiGenerationResult>, [AiGenerationRequest]>()
    .mockResolvedValue({
      text: validResponse(),
      model: MODEL,
    });
  const ai = {
    assertEnabled: jestApi.fn(),
    getTimeoutMs: jestApi.fn().mockReturnValue(30_000),
    getProviderName: jestApi.fn().mockReturnValue('gemini'),
    generate,
  } as unknown as AiService;
  return {
    service: new TaskAssignmentAiService(prisma as never, ai),
    prisma,
    generate,
  };
}

describe('TaskAssignmentAiService', () => {
  afterEach(() => jestApi.restoreAllMocks());

  it('returns server metrics and sends no member names or identifiers to AI', async () => {
    const test = harness();
    const result = await test.service.generate(
      viewer(),
      assignableTask().publicId,
    );

    expect(result.recommendations[0]).toMatchObject({
      member: { name: 'Member 1', designation: 'Executive' },
      metrics: {
        activeTasks: 0,
        overdueTasks: 0,
        completionRate: 100,
        onTimeRate: 100,
        relevantCategoryCompletedTasks: 1,
        relevantCategoryOnTimeTasks: 1,
      },
    });
    expect(result.recommendations[0]?.metrics).not.toHaveProperty(
      'completedTasks',
    );
    expect(result.recommendations[0]?.metrics).not.toHaveProperty(
      'completedWithDeadline',
    );
    const request = test.generate.mock.calls[0]![0];
    expect(request.userPrompt).toContain('C01');
    expect(request.userPrompt).not.toContain('Member 1');
    expect(request.userPrompt).not.toContain(member(1).publicId);
    expect(request.userPrompt).not.toContain('member-1-db');
  });

  it('uses the current Member picker scope and excludes the current assignee', async () => {
    const test = harness({
      task: assignableTask({
        status: TaskStatus.ASSIGNED,
        assignments: [{ responsibleUserId: 'current-member-db' }],
      }),
    });

    await test.service.generate(viewer(), assignableTask().publicId);

    expect(test.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ role: UserRole.MEMBER }),
            { status: UserStatus.ACTIVE },
            { id: { notIn: ['current-member-db'] } },
          ],
        },
      }),
    );
  });

  it('does not call Gemini when no alternative candidate exists', async () => {
    const test = harness({ members: [] });

    await expect(
      test.service.generate(viewer(), assignableTask().publicId),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: TASK_ERROR_CODE.TASK_ASSIGNMENT_RECOMMENDATIONS_UNAVAILABLE,
      },
    });
    expect(test.generate).not.toHaveBeenCalled();
  });

  it('retries once for an unknown candidate reference', async () => {
    const test = harness();
    test.generate
      .mockResolvedValueOnce({ text: validResponse('C99'), model: MODEL })
      .mockResolvedValueOnce({ text: validResponse('C01'), model: MODEL });

    const result = await test.service.generate(
      viewer(),
      assignableTask().publicId,
    );

    expect(test.generate).toHaveBeenCalledTimes(2);
    expect(result.meta.attempts).toBe(2);
  });

  it('caps provider context at 20 and reports total eligible candidates', async () => {
    const test = harness({
      members: Array.from({ length: 21 }, (_, index) => member(index + 1)),
    });
    test.prisma.taskAssignment.findMany.mockResolvedValue([]);

    const result = await test.service.generate(
      viewer(UserRole.SUPER_ADMIN),
      assignableTask().publicId,
    );

    expect(result.meta.eligibleCandidates).toBe(21);
    expect(result.meta.consideredCandidates).toBe(20);
    expect(result.limitations).toContain(
      'Only 20 of 21 eligible Members were supplied to the AI model.',
    );
    const sent = JSON.parse(
      test.generate.mock.calls[0]![0].userPrompt.split('\n').at(-1)!,
    ) as { candidates: unknown[] };
    expect(sent.candidates).toHaveLength(20);
  });

  it('does not mutate assignments while generating', async () => {
    const test = harness();
    await test.service.generate(viewer(), assignableTask().publicId);
    expect(test.prisma.taskAssignment).not.toHaveProperty('create');
  });
});
