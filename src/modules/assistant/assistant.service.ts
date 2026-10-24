import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { AiService } from '../../shared/ai/ai.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { buildDashboardAiContext } from '../dashboard/dashboard-ai.context.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import type { ListTaskQueryDto } from '../task/dto/list-task-query.dto.js';
import type { SafeTaskResponse } from '../task/task.interface.js';
import { TaskService } from '../task/task.service.js';
import {
  buildAskOperixAnswerPrompt,
  ASK_OPERIX_ANSWER_SYSTEM_INSTRUCTION,
} from './assistant-answer.prompt.js';
import { parseAskOperixAnswer } from './assistant-answer.validator.js';
import {
  ASK_OPERIX_ANSWER_JSON_SCHEMA,
  ASK_OPERIX_MAX_OUTPUT_TOKENS,
  ASK_OPERIX_MEMBER_OPERATIONS_MESSAGE,
  ASK_OPERIX_PLAN_JSON_SCHEMA,
  ASK_OPERIX_TEMPERATURE,
  ASK_OPERIX_UNSUPPORTED_MESSAGE,
  ASK_OPERIX_ZERO_RESULTS_MESSAGE,
} from './assistant.constant.js';
import type {
  AskOperixAnswerDraft,
  AskOperixPlan,
  AskOperixResponse,
  AskOperixTaskReference,
  AskOperixValidationResult,
} from './assistant.interface.js';
import {
  buildAskOperixPlannerPrompt,
  ASK_OPERIX_PLANNER_SYSTEM_INSTRUCTION,
} from './assistant-planner.prompt.js';
import { parseAskOperixPlan } from './assistant-planner.validator.js';
import { buildAskOperixTaskContext } from './assistant-task.context.js';

interface GeneratedStage<T> {
  value: T;
  attempts: number;
  model: string;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly taskService: TaskService,
    private readonly dashboardService: DashboardService,
  ) {}

  async ask(
    viewer: OperixViewer,
    question: string,
  ): Promise<AskOperixResponse> {
    this.aiService.assertEnabled();
    const startedAt = Date.now();
    const deadline = startedAt + this.aiService.getTimeoutMs();
    const signal = AbortSignal.timeout(this.aiService.getTimeoutMs());
    const planner = await this.generateValidated(
      ASK_OPERIX_PLANNER_SYSTEM_INSTRUCTION,
      buildAskOperixPlannerPrompt(viewer.role, question),
      ASK_OPERIX_PLAN_JSON_SCHEMA,
      parseAskOperixPlan,
      signal,
      deadline,
      'planner',
    );

    if (planner.value.intent === 'NEEDS_CLARIFICATION') {
      return this.finishDeterministic(
        'NEEDS_CLARIFICATION',
        null,
        planner.value.clarification,
        planner,
        startedAt,
        viewer.role,
      );
    }
    if (planner.value.intent === 'UNSUPPORTED') {
      return this.finishDeterministic(
        'UNSUPPORTED',
        ASK_OPERIX_UNSUPPORTED_MESSAGE,
        null,
        planner,
        startedAt,
        viewer.role,
      );
    }
    if (
      planner.value.intent === 'OPERATIONS_SNAPSHOT' &&
      viewer.role === UserRole.MEMBER
    ) {
      return this.finishDeterministic(
        'UNSUPPORTED',
        ASK_OPERIX_MEMBER_OPERATIONS_MESSAGE,
        null,
        planner,
        startedAt,
        viewer.role,
      );
    }

    this.assertBudget(signal, deadline);
    if (planner.value.intent === 'TASK_QUERY') {
      return this.answerTaskQuery(
        viewer,
        question,
        planner,
        signal,
        deadline,
        startedAt,
      );
    }
    return this.answerOperations(
      viewer,
      question,
      planner as GeneratedStage<
        Extract<AskOperixPlan, { intent: 'OPERATIONS_SNAPSHOT' }>
      >,
      signal,
      deadline,
      startedAt,
    );
  }

  private async answerTaskQuery(
    viewer: OperixViewer,
    question: string,
    planner: GeneratedStage<AskOperixPlan>,
    signal: AbortSignal,
    deadline: number,
    startedAt: number,
  ): Promise<AskOperixResponse> {
    const plan = planner.value as Extract<
      AskOperixPlan,
      { intent: 'TASK_QUERY' }
    >;
    const query = this.toTaskQuery(plan);
    const result = await this.taskService.listTasks(viewer, query);
    this.assertBudget(signal, deadline);

    if (result.meta.total === 0) {
      return this.finishAnswered({
        draft: {
          answer: ASK_OPERIX_ZERO_RESULTS_MESSAGE,
          highlights: [],
          referencedTaskRefs: [],
          confidence: 'HIGH',
          limitations: [],
        },
        planner,
        answerAttempts: 0,
        model: planner.model,
        startedAt,
        intent: 'TASK_QUERY',
        tasksByRef: new Map(),
        operations: null,
        taskResultCount: 0,
        viewerRole: viewer.role,
      });
    }

    const suppliedTasks =
      plan.responseMode === 'COUNT'
        ? []
        : result.data.slice(0, plan.taskQuery.limit);
    const context = buildAskOperixTaskContext(suppliedTasks);
    const allowedRefs = new Set(context.tasksByRef.keys());
    const answer = await this.generateValidated(
      ASK_OPERIX_ANSWER_SYSTEM_INSTRUCTION,
      buildAskOperixAnswerPrompt({
        question,
        facts: {
          intent: plan.intent,
          responseMode: plan.responseMode,
          total: result.meta.total,
          tasks: context.facts,
          resultLimit: plan.taskQuery.limit,
        },
      }),
      ASK_OPERIX_ANSWER_JSON_SCHEMA,
      (raw) => parseAskOperixAnswer(raw, allowedRefs),
      signal,
      deadline,
      'answer',
    );
    const serverLimitations =
      result.meta.total > suppliedTasks.length && plan.responseMode !== 'COUNT'
        ? [
            `Only the first ${suppliedTasks.length} matching Tasks were supplied for explanation.`,
          ]
        : [];
    return this.finishAnswered({
      draft: {
        ...answer.value,
        limitations: this.mergeLimitations(
          serverLimitations,
          answer.value.limitations,
        ),
      },
      planner,
      answerAttempts: answer.attempts,
      model: answer.model,
      startedAt,
      intent: 'TASK_QUERY',
      tasksByRef: context.tasksByRef,
      operations: null,
      taskResultCount: result.meta.total,
      viewerRole: viewer.role,
    });
  }

  private async answerOperations(
    viewer: OperixViewer,
    question: string,
    planner: GeneratedStage<
      Extract<AskOperixPlan, { intent: 'OPERATIONS_SNAPSHOT' }>
    >,
    signal: AbortSignal,
    deadline: number,
    startedAt: number,
  ): Promise<AskOperixResponse> {
    const snapshot = await this.dashboardService.getOperationalSnapshot(
      viewer,
      planner.value.days,
      10,
    );
    this.assertBudget(signal, deadline);
    const built = buildDashboardAiContext(snapshot);
    const answer = await this.generateValidated(
      ASK_OPERIX_ANSWER_SYSTEM_INSTRUCTION,
      buildAskOperixAnswerPrompt({
        question,
        facts: { intent: planner.value.intent, snapshot: built.context },
      }),
      ASK_OPERIX_ANSWER_JSON_SCHEMA,
      (raw) => parseAskOperixAnswer(raw, new Set()),
      signal,
      deadline,
      'answer',
    );
    return this.finishAnswered({
      draft: {
        ...answer.value,
        limitations: this.mergeLimitations(
          built.limitations,
          answer.value.limitations,
        ),
      },
      planner,
      answerAttempts: answer.attempts,
      model: answer.model,
      startedAt,
      intent: 'OPERATIONS_SNAPSHOT',
      tasksByRef: new Map(),
      operations: {
        days: planner.value.days,
        asOf: snapshot.asOf.toISOString(),
      },
      days: planner.value.days,
      viewerRole: viewer.role,
    });
  }

  private async generateValidated<T>(
    systemInstruction: string,
    userPrompt: string,
    responseJsonSchema: Record<string, unknown>,
    validate: (raw: string) => AskOperixValidationResult<T>,
    signal: AbortSignal,
    deadline: number,
    stage: 'planner' | 'answer',
  ): Promise<GeneratedStage<T>> {
    let attempts = 0;
    let lastReason = 'unknown';
    while (attempts < AI_MAX_ATTEMPTS) {
      this.assertBudget(signal, deadline);
      const remainingMs = deadline - Date.now();
      if (attempts > 0 && remainingMs < AI_MIN_RETRY_BUDGET_MS) break;
      attempts += 1;
      const generated = await this.aiService.generate({
        systemInstruction,
        userPrompt,
        responseJsonSchema,
        temperature: ASK_OPERIX_TEMPERATURE,
        maxOutputTokens: ASK_OPERIX_MAX_OUTPUT_TOKENS,
        signal,
        timeoutMs: remainingMs,
      });
      const parsed = validate(generated.text);
      if (parsed.ok)
        return { value: parsed.value, attempts, model: generated.model };
      lastReason = parsed.reason;
      this.logger.warn(
        JSON.stringify({
          event: 'ask_operix_invalid_output',
          feature: 'ASK_OPERIX',
          stage,
          attempt: attempts,
          reason: lastReason,
        }),
      );
    }
    throw new AppException(
      HttpStatus.BAD_GATEWAY,
      APP_ERROR_CODE.AI_RESPONSE_INVALID,
      'The AI response could not be used. Please try again.',
    );
  }

  private toTaskQuery(
    plan: Extract<AskOperixPlan, { intent: 'TASK_QUERY' }>,
  ): ListTaskQueryDto {
    const query: ListTaskQueryDto = { page: 1, limit: plan.taskQuery.limit };
    if (plan.taskQuery.status !== null) query.status = plan.taskQuery.status;
    if (plan.taskQuery.priority !== null)
      query.priority = plan.taskQuery.priority;
    if (plan.taskQuery.overdue !== null) query.overdue = plan.taskQuery.overdue;
    if (plan.taskQuery.scope !== null) query.scope = plan.taskQuery.scope;
    if (plan.taskQuery.recurrenceFrequency !== null)
      query.recurrenceFrequency = plan.taskQuery.recurrenceFrequency;
    if (plan.taskQuery.text !== null) query.q = plan.taskQuery.text;
    if (plan.taskQuery.sort !== null) query.sort = plan.taskQuery.sort;
    return query;
  }

  private finishDeterministic(
    status: 'NEEDS_CLARIFICATION' | 'UNSUPPORTED',
    answer: string | null,
    clarification: string | null,
    planner: GeneratedStage<AskOperixPlan>,
    startedAt: number,
    viewerRole: UserRole,
  ): AskOperixResponse {
    this.logResult({
      viewerRole,
      plannerIntent: planner.value.intent,
      resultStatus: status,
      plannerAttempts: planner.attempts,
      answerAttempts: 0,
      latencyMs: Date.now() - startedAt,
    });
    return {
      status,
      answer,
      clarification,
      highlights: [],
      references: { tasks: [], operations: null },
      confidence: null,
      limitations: [],
      meta: {
        provider: this.aiService.getProviderName(),
        model: planner.model,
        attempts: planner.attempts,
        latencyMs: Date.now() - startedAt,
        intent: null,
      },
    };
  }

  private finishAnswered(input: {
    draft: AskOperixAnswerDraft;
    planner: GeneratedStage<AskOperixPlan>;
    answerAttempts: number;
    model: string;
    startedAt: number;
    intent: 'TASK_QUERY' | 'OPERATIONS_SNAPSHOT';
    tasksByRef: Map<string, SafeTaskResponse>;
    operations: { days: 7 | 30 | 90; asOf: string } | null;
    taskResultCount?: number;
    days?: number;
    viewerRole: UserRole;
  }): AskOperixResponse {
    const tasks: AskOperixTaskReference[] = input.draft.referencedTaskRefs.map(
      (ref) => {
        const task = input.tasksByRef.get(ref)!;
        return {
          id: task.id,
          referenceCode: task.referenceCode,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
        };
      },
    );
    const latencyMs = Date.now() - input.startedAt;
    this.logResult({
      viewerRole: input.viewerRole,
      plannerIntent: input.intent,
      resultStatus: 'ANSWERED',
      plannerAttempts: input.planner.attempts,
      answerAttempts: input.answerAttempts,
      latencyMs,
      taskResultCount: input.taskResultCount,
      days: input.days,
    });
    return {
      status: 'ANSWERED',
      answer: input.draft.answer,
      clarification: null,
      highlights: input.draft.highlights,
      references: { tasks, operations: input.operations },
      confidence: input.draft.confidence,
      limitations: input.draft.limitations,
      meta: {
        provider: this.aiService.getProviderName(),
        model: input.model,
        attempts: input.planner.attempts + input.answerAttempts,
        latencyMs,
        intent: input.intent,
      },
    };
  }

  private assertBudget(signal: AbortSignal, deadline: number): void {
    if (!signal.aborted && deadline - Date.now() > 0) return;
    throw new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      'AI request timed out.',
    );
  }
  private mergeLimitations(server: string[], model: string[]): string[] {
    return [...new Set([...server, ...model])].slice(0, 8);
  }
  private logResult(value: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event: 'ask_operix_completed',
        feature: 'ASK_OPERIX',
        provider: this.aiService.getProviderName(),
        ...value,
      }),
    );
  }
}
