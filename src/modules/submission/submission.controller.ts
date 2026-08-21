import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { SubmissionService } from './submission.service.js';

@ApiTags('submissions')
@Controller('submissions')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Get(':submissionId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getSubmission(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissionService.getSubmission(viewer, submissionId);
  }
}
