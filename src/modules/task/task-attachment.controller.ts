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
import { TaskAttachmentService } from './task-attachment.service.js';

@ApiTags('task-attachments')
@Controller('tasks/:taskId/attachments')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TaskAttachmentController {
  constructor(private readonly taskAttachmentService: TaskAttachmentService) {}

  @Post()
  @RequireRoles(UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENT_FILES, {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_ATTACHMENT_FILES,
      },
    }),
  )
  uploadTaskAttachments(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.taskAttachmentService.uploadTaskAttachments(
      viewer,
      taskId,
      files,
    );
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listTaskAttachments(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskAttachmentService.listTaskAttachments(viewer, taskId);
  }

  @Delete(':attachmentId')
  @RequireRoles(UserRole.ADMIN)
  deleteTaskAttachment(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Param('attachmentId', PublicIdPipe) attachmentId: string,
  ) {
    return this.taskAttachmentService.deleteTaskAttachment(
      viewer,
      taskId,
      attachmentId,
    );
  }
}
