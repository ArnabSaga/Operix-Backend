import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { buildContentDisposition } from './file.mapper.js';
import { FileService } from './file.service.js';

@ApiTags('files')
@Controller('files')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get(':fileId/download')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  async downloadFile(
    @CurrentViewer() viewer: OperixViewer,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.fileService.downloadFile(viewer, fileId);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      buildContentDisposition(file.originalName),
    );

    return new StreamableFile(file.stream);
  }
}
