import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { AiService } from '../../shared/ai/ai.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  DASHBOARD_AI_ADVISORY_LIMITATION,
  DASHBOARD_AI_BRIEF_JSON_SCHEMA,
  DASHBOARD_AI_LIMITATIONS_MAX_ITEMS,
  DASHBOARD_AI_MAX_OUTPUT_TOKENS,
  DASHBOARD_AI_MEMBER_LIMIT,
  DASHBOARD_AI_NO_MUTATION_LIMITATION,
  DASHBOARD_AI_PERIOD,
  DASHBOARD_AI_PERIOD_DAYS,
  DASHBOARD_AI_SYSTEM_INSTRUCTION,
  DASHBOARD_AI_TEMPERATURE,
  type DashboardAiPeriod,
} from './dashboard-ai.constant.js';
import { buildDashboardAiContext } from './dashboard-ai.context.js';
import type {
  DashboardAiBriefResponse,
  DashboardAiValidationFailureReason,
} from './dashboard-ai.interface.js';
import { buildDashboardAiPrompt } from './dashboard-ai.prompt.js';
import { parseDashboardAiBrief } from './dashboard-ai.validator.js';
import { DashboardService } from './dashboard.service.js';

@Injectable()
export class DashboardAiService {
  private readonly logger = new Logger(DashboardAiService.name);
  private readonly businessTimezone: string;

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly aiService: AiService,
    configService: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone = configService.get('app.businessTimezone', {
      infer: true,
    });
  }

  async generate(
    viewer: OperixViewer,
    period: DashboardAiPeriod = DASHBOARD_AI_PERIOD.LAST_7_DAYS,
  ): Promise<DashboardAiBriefResponse> {
    this.assertRole(viewer);
    this.aiService.assertEnabled();

    const days = DASHBOARD_AI_PERIOD_DAYS[period];
    const snapshot = await this.dashboardService.getAiOperationalSnapshot(
      viewer,
      days,
      DASHBOARD_AI_MEMBER_LIMIT,
      this.businessTimezone,
    );
    const built = buildDashboardAiContext(snapshot, period);
    const prompt = buildDashboardAiPrompt(built.context);
    const serverLimitations = [
      DASHBOARD_AI_ADVISORY_LIMITATION,
      DASHBOARD_AI_NO_MUTATION_LIMITATION,
      ...built.limitations,
    ];
    const startedAt = Date.now();
    const timeoutMs = this.aiService.getTimeoutMs();
    const deadline = startedAt + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);
    let attempts = 0;
    let lastReason: DashboardAiValidationFailureReason | 'unknown' = 'unknown';

    while (attempts < AI_MAX_ATTEMPTS) {
      if (signal.aborted) throw this.timedOut();
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw this.timedOut();
      if (attempts > 0 && remainingMs < AI_MIN_RETRY_BUDGET_MS) break;
      attempts += 1;

      const generated = await this.aiService.generate({
        systemInstruction: DASHBOARD_AI_SYSTEM_INSTRUCTION,
        userPrompt: prompt,
        responseJsonSchema: DASHBOARD_AI_BRIEF_JSON_SCHEMA,
        temperature: DASHBOARD_AI_TEMPERATURE,
        maxOutputTokens: DASHBOARD_AI_MAX_OUTPUT_TOKENS,
        signal,
        timeoutMs: remainingMs,
      });
      const parsed = parseDashboardAiBrief(generated.text);

      if (parsed.ok) {
        const latencyMs = Date.now() - startedAt;
        this.logger.log(
          JSON.stringify({
            event: 'dashboard_ai_brief_succeeded',
            feature: 'DASHBOARD_OPERATIONS_BRIEF',
            viewerRole: viewer.role,
            period,
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
            outcome: 'success',
          }),
        );

        return {
          snapshot: this.toSnapshot(
            built.context,
            snapshot.periodStart,
            period,
          ),
          brief: {
            ...parsed.brief,
            limitations: this.mergeLimitations(
              serverLimitations,
              parsed.brief.limitations,
            ),
          },
          meta: {
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
            period,
            days,
            asOf: built.context.asOf,
          },
        };
      }

      lastReason = parsed.reason;
      this.logger.warn(
        JSON.stringify({
          event: 'dashboard_ai_brief_invalid',
          feature: 'DASHBOARD_OPERATIONS_BRIEF',
          viewerRole: viewer.role,
          period,
          provider: this.aiService.getProviderName(),
          attempt: attempts,
          reason: parsed.reason,
          outcome: 'invalid_output',
        }),
      );
    }

    this.logger.warn(
      JSON.stringify({
        event: 'dashboard_ai_brief_rejected',
        feature: 'DASHBOARD_OPERATIONS_BRIEF',
        viewerRole: viewer.role,
        period,
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

  private assertRole(viewer: OperixViewer): void {
    if (
      viewer.role !== UserRole.SUPER_ADMIN &&
      viewer.role !== UserRole.ADMIN
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private mergeLimitations(server: string[], model: string[]): string[] {
    return [...new Set([...server, ...model])].slice(
      0,
      DASHBOARD_AI_LIMITATIONS_MAX_ITEMS,
    );
  }

  /**
   * KPI keys are role-specific, so the snapshot is resolved from the built
   * context by name. A renamed key must never silently become a confident `0`:
   * every miss is collected and logged, and the unit suite asserts that both
   * role shapes resolve without a miss.
   */
  private toSnapshot(
    context: ReturnType<typeof buildDashboardAiContext>['context'],
    periodStart: Date | undefined,
    period: DashboardAiPeriod,
  ): DashboardAiBriefResponse['snapshot'] {
    const missing: string[] = [];
    const value = (...keys: string[]): number => {
      for (const key of keys) {
        const candidate = context.kpis[key];
        if (typeof candidate === 'number') return candidate;
      }

      missing.push(keys.join('|'));
      return 0;
    };

    const snapshot: DashboardAiBriefResponse['snapshot'] = {
      period,
      periodStart: (periodStart ?? new Date(context.asOf)).toISOString(),
      asOf: context.asOf,
      activeTasks: value('activeTasks', 'activeTeamTasks'),
      overdueTasks: value('overdueTasks'),
      reviewQueueTasks: value('taskReviewQueue', 'reviewQueueTasks'),
      revisionRequiredTasks: value('revisionRequiredTasks'),
      completedInPeriod: context.completionTrend.completedInWindow,
    };

    if (missing.length > 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'dashboard_ai_snapshot_kpi_missing',
          feature: 'DASHBOARD_OPERATIONS_BRIEF',
          viewerRole: context.role,
          period,
          missing,
        }),
      );
    }

    return snapshot;
  }

  private timedOut(): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_TIMEOUT,
      'AI request timed out.',
    );
  }
}
