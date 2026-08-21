import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewService } from './review.service.js';

@ApiTags('submissions')
@Controller('submissions/:submissionId/reviews')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @RequireRoles(UserRole.ADMIN)
  createReview(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId') submissionId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(viewer, submissionId, dto);
  }
}
