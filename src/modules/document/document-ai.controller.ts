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
import type { DocumentAiResponse } from './document-ai.interface.js';
import { DocumentAiService } from './document-ai.service.js';

/**
 * Advisory AI analysis for one Document.
 *
 * The body is intentionally empty: the provider only sees text extracted from
 * the already-authorised file, and the request cannot influence the prompt.
 * Authorisation is exactly the Documents scope, so analysis never grants
 * broader file, Task, Submission, or mutation access.
 */
@ApiTags('documents')
@Controller('documents')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class DocumentAiController {
  constructor(private readonly documentAiService: DocumentAiService) {}

  @Post(':documentId/ai-analysis')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  analyzeDocument(
    @CurrentViewer() viewer: OperixViewer,
    @Param('documentId', PublicIdPipe) documentId: string,
  ): Promise<DocumentAiResponse> {
    return this.documentAiService.analyzeDocument(viewer, documentId);
  }
}
