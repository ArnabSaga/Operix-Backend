import {
  Controller,
  Get,
  Param,
  Query,
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
import { buildContentDisposition } from '../file/file.mapper.js';
import { ExportDashboardTrendQueryDto } from './dto/export-dashboard-trend-query.dto.js';
import { ExportFormatQueryDto } from './dto/export-format-query.dto.js';
import { ExportManagementReportQueryDto } from './dto/export-management-report-query.dto.js';
import { ExportMemberPerformanceQueryDto } from './dto/export-member-performance-query.dto.js';
import { ExportTaskQueryDto } from './dto/export-task-query.dto.js';
import { ExportService } from './export.service.js';

@ApiTags('exports')
@Controller('exports')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('tasks')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  async exportTasks(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ExportTaskQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportTasks(viewer, query),
      response,
    );
  }

  @Get('performance/members')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportMemberPerformance(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ExportMemberPerformanceQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportMemberPerformance(viewer, query),
      response,
    );
  }

  @Get('performance/teams/:teamId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportTeamPerformance(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId') teamId: string,
    @Query() query: ExportFormatQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportTeamPerformance(viewer, teamId, query),
      response,
    );
  }

  @Get('dashboard/workload')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  async exportDashboardWorkload(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ExportFormatQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportDashboardWorkload(viewer, query),
      response,
    );
  }

  @Get('dashboard/trends')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  async exportDashboardTrends(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ExportDashboardTrendQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportDashboardTrends(viewer, query),
      response,
    );
  }

  @Get('management-reports')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportManagementReports(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ExportManagementReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stream(
      await this.exportService.exportManagementReports(viewer, query),
      response,
    );
  }

  private stream(
    file: { buffer: Buffer; filename: string; contentType: string },
    response: Response,
  ): StreamableFile {
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      buildContentDisposition(file.filename),
    );

    return new StreamableFile(file.buffer);
  }
}
