import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import { CreateSubmissionDto } from './dto/create-submission.dto.js';
import { SubmissionService } from './submission.service.js';

@ApiTags('submissions')
@Controller('tasks/:taskId/submissions')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TaskSubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post()
  @RequireRoles(UserRole.MEMBER)
  createSubmission(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissionService.createSubmission(viewer, taskId, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listTaskSubmissions(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId') taskId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.submissionService.listTaskSubmissions(viewer, taskId, query);
  }
}
