import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import {
  MAX_ATTACHMENT_FILES,
  MAX_FILE_SIZE_BYTES,
} from '../../shared/file-storage/file-storage.constant.js';
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
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENT_FILES, {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_ATTACHMENT_FILES,
      },
    }),
  )
  createSubmission(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: CreateSubmissionDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.submissionService.createSubmission(viewer, taskId, dto, files);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listTaskSubmissions(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.submissionService.listTaskSubmissions(viewer, taskId, query);
  }
}
