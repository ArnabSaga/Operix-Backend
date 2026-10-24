import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  TaskPriority,
  TaskStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { AiService } from '../../shared/ai/ai.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
} from '../performance/performance.calculator.js';
import { buildMemberScopeWhere } from '../user-management/member/member-scope.policy.js';
import { resolveAssignableTask } from './policies/task-assignment.policy.js';
import {
  TASK_ASSIGNMENT_AI_ADVISORY_LIMITATION,
  TASK_ASSIGNMENT_AI_AVAILABILITY_LIMITATION,
  TASK_ASSIGNMENT_AI_CAPABILITY_LIMITATION,
  TASK_ASSIGNMENT_AI_CANDIDATE_LIMIT,
  TASK_ASSIGNMENT_AI_JSON_SCHEMA,
  TASK_ASSIGNMENT_AI_LIMITATIONS_MAX_ITEMS,
  TASK_ASSIGNMENT_AI_MAX_OUTPUT_TOKENS,
  TASK_ASSIGNMENT_AI_NO_CATEGORY_LIMITATION,
  TASK_ASSIGNMENT_AI_SYSTEM_INSTRUCTION,
  TASK_ASSIGNMENT_AI_TEMPERATURE,
} from './task-assignment-ai.constant.js';
import { buildTaskAssignmentAiContext } from './task-assignment-ai.context.js';
import type {
  TaskAssignmentAiCandidate,
  TaskAssignmentAiResponse,
  TaskAssignmentAiValidationFailureReason,
} from './task-assignment-ai.interface.js';
import { buildTaskAssignmentAiPrompt } from './task-assignment-ai.prompt.js';
import { parseTaskAssignmentAiDraft } from './task-assignment-ai.validator.js';
import { TASK_ERROR_CODE } from './task.constant.js';

@Injectable()
export class TaskAssignmentAiService {
  private readonly logger = new Logger(TaskAssignmentAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(
    viewer: OperixViewer,
    taskPublicId: string,
  ): Promise<TaskAssignmentAiResponse> {
    const task = await resolveAssignableTask(this.prisma, viewer, taskPublicId);
    this.aiService.assertEnabled();

    const asOf = new Date();
    const allCandidates = await this.loadCandidates(
      viewer,
      task.category?.id ?? null,
      new Set(
        task.assignments.map((assignment) => assignment.responsibleUserId),
      ),
      asOf,
    );

    if (allCandidates.length === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_ASSIGNMENT_RECOMMENDATIONS_UNAVAILABLE,
        'No eligible alternative Members are currently available for an AI assignment recommendation.',
      );
    }

    const candidates = allCandidates
      .sort(compareCandidates)
      .slice(0, TASK_ASSIGNMENT_AI_CANDIDATE_LIMIT)
      .map((candidate, index) => ({
        ...candidate,
        candidateRef: `C${String(index + 1).padStart(2, '0')}`,
      }));
    const context = buildTaskAssignmentAiContext({
      task: {
        title: clamp(task.title, 180),
        description: clampNullable(task.description, 5_000),
        remarks: clampNullable(task.remarks, 2_000),
        priority: task.priority,
        dueAt: task.dueAt?.toISOString() ?? null,
        completionMode: task.completionMode,
        scope: task.scope,
        teamName: clampNullable(task.team?.name ?? null, 200),
        categoryName: clampNullable(task.category?.name ?? null, 200),
      },
      candidates,
    });
    const allowedRefs = new Set(
      candidates.map((candidate) => candidate.candidateRef),
    );
    const serverLimitations = [
      TASK_ASSIGNMENT_AI_ADVISORY_LIMITATION,
      TASK_ASSIGNMENT_AI_AVAILABILITY_LIMITATION,
      TASK_ASSIGNMENT_AI_CAPABILITY_LIMITATION,
      ...(task.category ? [] : [TASK_ASSIGNMENT_AI_NO_CATEGORY_LIMITATION]),
      ...(allCandidates.length > candidates.length
        ? [
            `Only ${candidates.length} of ${allCandidates.length} eligible Members were supplied to the AI model.`,
          ]
        : []),
    ];
    const startedAt = Date.now();
    const timeoutMs = this.aiService.getTimeoutMs();
    const deadline = startedAt + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);
    let attempts = 0;
    let lastReason: TaskAssignmentAiValidationFailureReason | 'unknown' =
      'unknown';

    while (attempts < AI_MAX_ATTEMPTS) {
      if (signal.aborted) throw this.timedOut();
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw this.timedOut();
      if (attempts > 0 && remainingMs < AI_MIN_RETRY_BUDGET_MS) break;
      attempts += 1;

      const generated = await this.aiService.generate({
        systemInstruction: TASK_ASSIGNMENT_AI_SYSTEM_INSTRUCTION,
        userPrompt: buildTaskAssignmentAiPrompt(context),
        responseJsonSchema: TASK_ASSIGNMENT_AI_JSON_SCHEMA,
        temperature: TASK_ASSIGNMENT_AI_TEMPERATURE,
        maxOutputTokens: TASK_ASSIGNMENT_AI_MAX_OUTPUT_TOKENS,
        signal,
        timeoutMs: remainingMs,
      });
      const parsed = parseTaskAssignmentAiDraft(generated.text, allowedRefs);

      if (parsed.ok) {
        const byRef = new Map(
          candidates.map((candidate) => [candidate.candidateRef, candidate]),
        );
        const latencyMs = Date.now() - startedAt;
        this.logOutcome({
          viewer,
          task,
          eligibleCandidates: allCandidates.length,
          consideredCandidates: candidates.length,
          model: generated.model,
          attempts,
          latencyMs,
          outcome: 'success',
        });

        return {
          taskId: task.publicId,
          asOf: asOf.toISOString(),
          decision: parsed.draft.decision,
          summary: parsed.draft.summary,
          recommendations: parsed.draft.recommendations.map(
            (recommendation, index) => {
              const candidate = byRef.get(recommendation.candidateRef)!;
              return {
                rank: index + 1,
                member: {
                  id: candidate.publicId,
                  name: candidate.name,
                  designation: candidate.designation,
                  teamName: candidate.teamName,
                },
                metrics: {
                  activeTasks: candidate.metrics.activeTasks,
                  overdueTasks: candidate.metrics.overdueTasks,
                  activeUrgentTasks: candidate.metrics.activeUrgentTasks,
                  activeHighTasks: candidate.metrics.activeHighTasks,
                  completionRate: candidate.metrics.completionRate,
                  onTimeRate: candidate.metrics.onTimeRate,
                  averageCompletionMinutes:
                    candidate.metrics.averageCompletionMinutes,
                  relevantCategoryCompletedTasks:
                    candidate.metrics.relevantCategoryCompletedTasks,
                  relevantCategoryOnTimeTasks:
                    candidate.metrics.relevantCategoryOnTimeTasks,
                },
                rationale: recommendation.rationale,
                strengths: recommendation.strengths,
                cautions: recommendation.cautions,
              };
            },
          ),
          confidence: parsed.draft.confidence,
          limitations: mergeLimitations(
            serverLimitations,
            parsed.draft.limitations,
          ),
          meta: {
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
            eligibleCandidates: allCandidates.length,
            consideredCandidates: candidates.length,
          },
        };
      }

      lastReason = parsed.reason;
      this.logger.warn(
        JSON.stringify({
          event: 'task_assignment_ai_invalid',
          feature: 'TASK_ASSIGNMENT_RECOMMENDATION',
          role: viewer.role,
          taskScope: task.scope,
          completionMode: task.completionMode,
          eligibleCandidates: allCandidates.length,
          consideredCandidates: candidates.length,
          provider: this.aiService.getProviderName(),
          attempt: attempts,
          reason: parsed.reason,
          outcome: 'invalid_output',
        }),
      );
    }

    this.logger.warn(
      JSON.stringify({
        event: 'task_assignment_ai_rejected',
        feature: 'TASK_ASSIGNMENT_RECOMMENDATION',
        role: viewer.role,
        taskScope: task.scope,
        completionMode: task.completionMode,
        eligibleCandidates: allCandidates.length,
        consideredCandidates: candidates.length,
        provider: this.aiService.getProviderName(),
        attempts,
        reason: lastReason,
        outcome: 'rejected',
      }),
    );
    throw new AppException(
      HttpStatus.BAD_GATEWAY,
      APP_ERROR_CODE.AI_RESPONSE_INVALID,
      'The AI response could not be used. Please try again.',
    );
  }

  private async loadCandidates(
    viewer: OperixViewer,
    categoryId: string | null,
    excludedResponsibleIds: ReadonlySet<string>,
    asOf: Date,
  ): Promise<TaskAssignmentAiCandidate[]> {
    const members = await this.prisma.user.findMany({
      where: {
        AND: [
          buildMemberScopeWhere(viewer),
          { status: UserStatus.ACTIVE },
          ...(excludedResponsibleIds.size > 0
            ? [{ id: { notIn: [...excludedResponsibleIds] } }]
            : []),
        ],
      },
      select: {
        id: true,
        publicId: true,
        name: true,
        designation: true,
        teamMembership: { select: { team: { select: { name: true } } } },
      },
    });
    if (members.length === 0) return [];

    const memberIds = members.map((member) => member.id);
    const [assignments, reviews] = await Promise.all([
      this.prisma.taskAssignment.findMany({
        where: {
          responsibleUserId: { in: memberIds },
          unassignedAt: null,
        },
        select: {
          responsibleUserId: true,
          task: {
            select: {
              id: true,
              status: true,
              priority: true,
              dueAt: true,
              startedAt: true,
              completedAt: true,
              categoryId: true,
            },
          },
        },
      }),
      this.prisma.taskReview.findMany({
        where: {
          action: 'REQUEST_REVISION',
          submission: { submittedById: { in: memberIds } },
        },
        select: {
          submission: { select: { submittedById: true, taskId: true } },
        },
      }),
    ]);

    const tasksByMember = new Map<
      string,
      (typeof assignments)[number]['task'][]
    >();
    for (const assignment of assignments) {
      const current = tasksByMember.get(assignment.responsibleUserId) ?? [];
      current.push(assignment.task);
      tasksByMember.set(assignment.responsibleUserId, current);
    }
    const revisionsByMember = new Map<string, { taskId: string }[]>();
    for (const review of reviews) {
      const memberId = review.submission.submittedById;
      const current = revisionsByMember.get(memberId) ?? [];
      current.push({ taskId: review.submission.taskId });
      revisionsByMember.set(memberId, current);
    }

    return members.map((member) => {
      const tasks = tasksByMember.get(member.id) ?? [];
      const performance = calculatePerformanceMetrics(
        tasks,
        revisionsByMember.get(member.id) ?? [],
      );
      const workload = calculateWorkloadMetrics(tasks, asOf);
      const relevant =
        categoryId === null
          ? null
          : tasks.filter(
              (task) =>
                task.categoryId === categoryId &&
                task.status === TaskStatus.COMPLETED,
            );

      return {
        candidateRef: '',
        privateId: member.id,
        publicId: member.publicId,
        name: member.name,
        designation: clampNullable(member.designation, 200),
        teamName: clampNullable(member.teamMembership?.team.name ?? null, 200),
        metrics: {
          activeTasks: workload.activeTasks,
          overdueTasks: workload.overdueTasks,
          activeUrgentTasks: workload.activePriorityCounts[TaskPriority.URGENT],
          activeHighTasks: workload.activePriorityCounts[TaskPriority.HIGH],
          completionRate: performance.completionRate,
          onTimeRate: performance.onTimeRate,
          averageCompletionMinutes: performance.averageCompletionMinutes,
          completedTasks: performance.completedTasks,
          completedWithDeadline: performance.completedWithDeadline,
          relevantCategoryCompletedTasks: relevant?.length ?? null,
          relevantCategoryOnTimeTasks:
            relevant?.filter(
              (task) =>
                task.dueAt !== null &&
                task.completedAt !== null &&
                task.completedAt <= task.dueAt,
            ).length ?? null,
        },
      };
    });
  }

  private logOutcome(input: {
    viewer: OperixViewer;
    task: { scope: string; completionMode: string };
    eligibleCandidates: number;
    consideredCandidates: number;
    model: string;
    attempts: number;
    latencyMs: number;
    outcome: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'task_assignment_ai_succeeded',
        feature: 'TASK_ASSIGNMENT_RECOMMENDATION',
        role: input.viewer.role,
        taskScope: input.task.scope,
        completionMode: input.task.completionMode,
        eligibleCandidates: input.eligibleCandidates,
        consideredCandidates: input.consideredCandidates,
        provider: this.aiService.getProviderName(),
        model: input.model,
        attempts: input.attempts,
        latencyMs: input.latencyMs,
        outcome: input.outcome,
      }),
    );
  }

  private timedOut(): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      'AI request timed out.',
    );
  }
}

function compareCandidates(
  left: TaskAssignmentAiCandidate,
  right: TaskAssignmentAiCandidate,
): number {
  return (
    left.metrics.overdueTasks - right.metrics.overdueTasks ||
    left.metrics.activeTasks - right.metrics.activeTasks ||
    left.metrics.activeUrgentTasks - right.metrics.activeUrgentTasks ||
    left.metrics.activeHighTasks - right.metrics.activeHighTasks ||
    compareNullableDescending(
      left.metrics.relevantCategoryCompletedTasks,
      right.metrics.relevantCategoryCompletedTasks,
    ) ||
    compareNullableDescending(
      left.metrics.onTimeRate,
      right.metrics.onTimeRate,
    ) ||
    compareNullableDescending(
      left.metrics.completionRate,
      right.metrics.completionRate,
    ) ||
    left.publicId.localeCompare(right.publicId)
  );
}

function compareNullableDescending(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function mergeLimitations(server: string[], model: string[]): string[] {
  return [...new Set([...server, ...model])].slice(
    0,
    TASK_ASSIGNMENT_AI_LIMITATIONS_MAX_ITEMS,
  );
}

function clamp(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function clampNullable(value: string | null, maxLength: number): string | null {
  return value === null ? null : clamp(value, maxLength);
}
