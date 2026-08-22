import {
  Controller,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import {
  SPREADSHEET_LIMIT,
  SPREADSHEET_MIME_TYPE,
} from '../../shared/spreadsheet/spreadsheet.constant.js';
import { buildContentDisposition } from '../file/file.mapper.js';
import { IMPORT_TYPE } from './import.constant.js';
import { ImportService } from './import.service.js';

const IMPORT_FILE_INTERCEPTOR = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: SPREADSHEET_LIMIT.MAX_IMPORT_WORKBOOK_SIZE_BYTES,
    files: 1,
  },
});

@ApiTags('imports')
@Controller('imports')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('members/preview')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  previewMembers(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.importService.preview(viewer, IMPORT_TYPE.MEMBER, file);
  }

  @Post('members')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  importMembers(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.importService.importMembers(viewer, file);
  }

  @Post('members/error-report')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  async memberErrorReport(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.importService.errorReport(
      viewer,
      IMPORT_TYPE.MEMBER,
      file,
    );

    response.setHeader('Content-Type', SPREADSHEET_MIME_TYPE);
    response.setHeader(
      'Content-Disposition',
      buildContentDisposition(report.filename),
    );

    return new StreamableFile(report.buffer);
  }

  @Post('historical-tasks/preview')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  previewHistoricalTasks(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.importService.preview(
      viewer,
      IMPORT_TYPE.HISTORICAL_TASK,
      file,
    );
  }

  @Post('historical-tasks')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  importHistoricalTasks(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.importService.importHistoricalTasks(viewer, file);
  }

  @Post('historical-tasks/error-report')
  @RequireRoles(UserRole.SUPER_ADMIN)
  @UseInterceptors(IMPORT_FILE_INTERCEPTOR)
  async historicalTaskErrorReport(
    @CurrentViewer() viewer: OperixViewer,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.importService.errorReport(
      viewer,
      IMPORT_TYPE.HISTORICAL_TASK,
      file,
    );

    response.setHeader('Content-Type', SPREADSHEET_MIME_TYPE);
    response.setHeader(
      'Content-Disposition',
      buildContentDisposition(report.filename),
    );

    return new StreamableFile(report.buffer);
  }
}
