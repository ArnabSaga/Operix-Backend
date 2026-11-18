import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { SubmissionService } from './submission.service.js';

@ApiTags('submission-attachments')
@Controller('submissions/:submissionId/attachments')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class SubmissionAttachmentController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listSubmissionAttachments(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId', PublicIdPipe) submissionId: string,
  ) {
    return this.submissionService.listSubmissionAttachments(
      viewer,
      submissionId,
    );
  }

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENT_FILES, {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_ATTACHMENT_FILES,
      },
    }),
  )
  uploadSubmissionAttachments(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId', PublicIdPipe) submissionId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.submissionService.uploadSubmissionAttachments(
      viewer,
      submissionId,
      files,
    );
  }

  @Delete(':fileId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  deleteSubmissionAttachment(
    @CurrentViewer() viewer: OperixViewer,
    @Param('submissionId', PublicIdPipe) submissionId: string,
    @Param('fileId', PublicIdPipe) fileId: string,
  ) {
    return this.submissionService.deleteSubmissionAttachment(
      viewer,
      submissionId,
      fileId,
    );
  }
}
