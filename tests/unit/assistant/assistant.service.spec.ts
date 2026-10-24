import {
  TaskPriority,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { AssistantService } from '../../../src/modules/assistant/assistant.service';
import type { DashboardService } from '../../../src/modules/dashboard/dashboard.service';
import type { TaskService } from '../../../src/modules/task/task.service';
import type { AiService } from '../../../src/shared/ai/ai.service';
import type {
  AiGenerationRequest,
  AiGenerationResult,
} from '../../../src/shared/ai/ai.interface';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const planner = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    intent: 'TASK_QUERY',
    taskQuery: {
      status: null,
      priority: null,
      overdue: null,
      scope: null,
      recurrenceFrequency: null,
      text: null,
      sort: 'DUE_AT_ASC',
      limit: 10,
    },
    responseMode: 'LIST',
    ...overrides,
  });
const answer = (refs: string[] = ['T01']) =>
  JSON.stringify({
    answer: 'One Task matched.',
    highlights: ['One active Task.'],
    referencedTaskRefs: refs,
    confidence: 'HIGH',
    limitations: [],
  });

function viewer(role: UserRole = UserRole.MEMBER): OperixViewer {
  return {
    userId: 'viewer-private',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.ADMIN
        ? { type: 'ADMIN', teamIds: ['team-private'] }
        : { type: 'GLOBAL' },
  };
}

function harness(outputs: string[], total = 1) {
  const requests: AiGenerationRequest[] = [];
  let outputIndex = 0;
  const generate = jestApi.fn(
    (request: AiGenerationRequest): Promise<AiGenerationResult> => {
      requests.push(request);
      return Promise.resolve({
        text: outputs[outputIndex++] ?? '',
        model: 'gemini-test',
      });
    },
  );
  const listTasks = jestApi.fn().mockResolvedValue({
    data:
      total === 0
        ? []
        : [
            {
              id: 'task-public',
              referenceCode: 'TASK-1',
              title: 'Prepare report',
              description: 'private description',
              remarks: null,
              priority: TaskPriority.HIGH,
              status: TaskStatus.IN_PROGRESS,
              scope: TaskScope.TEAM,
              dueAt: new Date('2026-10-25T00:00:00Z'),
              team: { id: 'team-public', name: 'Operations' },
              responsible: { id: 'member-public', name: 'Member A' },
            },
          ],
    meta: { page: 1, limit: 10, total, totalPages: total === 0 ? 0 : 1 },
  });
  const getOperationalSnapshot = jestApi.fn();
  const service = new AssistantService(
    {
      assertEnabled: jestApi.fn(),
      getTimeoutMs: () => 30_000,
      getProviderName: () => 'gemini',
      generate,
    } as unknown as AiService,
    { listTasks } as unknown as TaskService,
    { getOperationalSnapshot } as unknown as DashboardService,
  );
  return { service, generate, requests, listTasks, getOperationalSnapshot };
}

describe('AssistantService', () => {
  it('executes Task plans through TaskService and maps server owned references', async () => {
    const test = harness([planner(), answer()]);
    const result = await test.service.ask(viewer(), 'Show my Tasks');
    expect(test.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'viewer-private' }),
      expect.objectContaining({ page: 1, limit: 10, sort: 'DUE_AT_ASC' }),
    );
    expect(result.references.tasks).toEqual([
      expect.objectContaining({ id: 'task-public', referenceCode: 'TASK-1' }),
    ]);
    const answerPrompt = test.requests[1]!.userPrompt;
    expect(answerPrompt).toContain('"taskRef": "T01"');
    expect(answerPrompt).not.toContain('task-public');
    expect(answerPrompt).not.toContain('member-public');
    expect(answerPrompt).not.toContain('private description');
  });

  it('uses meta total for zero results without a second provider call', async () => {
    const test = harness([planner()], 0);
    const result = await test.service.ask(viewer(), 'Show overdue Tasks');
    expect(result.answer).toContain('No Tasks matched');
    expect(test.generate).toHaveBeenCalledTimes(1);
  });

  it('blocks Member operations plans before Dashboard access or answer generation', async () => {
    const test = harness([
      JSON.stringify({ intent: 'OPERATIONS_SNAPSHOT', days: 7 }),
    ]);
    const result = await test.service.ask(
      viewer(),
      'Give me an operations summary',
    );
    expect(result.status).toBe('UNSUPPORTED');
    expect(test.getOperationalSnapshot).not.toHaveBeenCalled();
    expect(test.generate).toHaveBeenCalledTimes(1);
  });

  it('retries hallucinated Task references once then fails closed', async () => {
    const test = harness([planner(), answer(['T99']), answer(['T99'])]);
    await expect(
      test.service.ask(viewer(), 'Show my Tasks'),
    ).rejects.toMatchObject({ response: { code: 'AI_RESPONSE_INVALID' } });
    expect(test.generate).toHaveBeenCalledTimes(3);
  });
});
