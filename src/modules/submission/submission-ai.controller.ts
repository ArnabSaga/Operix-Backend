import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { OperixUserThrottlerGuard } from '../../shared/rate-limit/operix-user-throttler.guard.js';
import type { SubmissionAiReviewResponse } from './submission-ai.interface.js';
import { SubmissionAiService } from './submission-ai.service.js';

/**
 * Advisory AI review for one Submission.
 *
 * The body is intentionally empty: the provider only sees server-selected
 * context for the current Submission version, and the request cannot influence
 * the prompt. Authority is exactly the real review authority.
 */
@ApiTags('submissions')
@Controller('submissions/:submissionId/ai-review')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class SubmissionAiController {
  constructor(private readonly submissionAiService: SubmissionAiService) {}

  @Post()
  @RequireRoles(UserRole.ADMIN)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  analyze(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId', PublicIdPipe) submissionId: string,
  ): Promise<SubmissionAiReviewResponse> {
    return this.submissionAiService.analyze(viewer, submissionId);
  }
}
