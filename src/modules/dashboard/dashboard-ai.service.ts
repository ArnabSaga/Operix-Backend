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
import {
  DASHBOARD_AI_ADVISORY_LIMITATION,
  DASHBOARD_AI_BRIEF_JSON_SCHEMA,
  DASHBOARD_AI_LIMITATIONS_MAX_ITEMS,
  DASHBOARD_AI_MAX_OUTPUT_TOKENS,
  DASHBOARD_AI_MEMBER_LIMIT,
  DASHBOARD_AI_NO_MUTATION_LIMITATION,
  DASHBOARD_AI_SYSTEM_INSTRUCTION,
  DASHBOARD_AI_TEMPERATURE,
} from './dashboard-ai.constant.js';
import { buildDashboardAiContext } from './dashboard-ai.context.js';
import type {
  DashboardAiBriefResponse,
  DashboardAiValidationFailureReason,
} from './dashboard-ai.interface.js';
import { buildDashboardAiPrompt } from './dashboard-ai.prompt.js';
import { parseDashboardAiBrief } from './dashboard-ai.validator.js';
import { DashboardTrendDays } from './dashboard.constant.js';
import { DashboardService } from './dashboard.service.js';

@Injectable()
export class DashboardAiService {
  private readonly logger = new Logger(DashboardAiService.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly aiService: AiService,
  ) {}

  async generate(
    viewer: OperixViewer,
    days: DashboardTrendDays = DashboardTrendDays.SEVEN,
  ): Promise<DashboardAiBriefResponse> {
    this.assertRole(viewer);
    this.aiService.assertEnabled();

    const snapshot = await this.dashboardService.getOperationalSnapshot(
      viewer,
      days,
      DASHBOARD_AI_MEMBER_LIMIT,
    );
    const built = buildDashboardAiContext(snapshot);
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
            role: viewer.role,
            days,
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
            outcome: 'success',
          }),
        );

        return {
          ...parsed.brief,
          limitations: this.mergeLimitations(
            serverLimitations,
            parsed.brief.limitations,
          ),
          meta: {
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
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
          role: viewer.role,
          days,
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
        role: viewer.role,
        days,
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

  private timedOut(): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      'AI request timed out.',
    );
  }
}
