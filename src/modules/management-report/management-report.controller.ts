import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { CreateManagementReportDto } from './dto/create-management-report.dto.js';
import { ListManagementReportQueryDto } from './dto/list-management-report-query.dto.js';
import { ReviewManagementReportDto } from './dto/review-management-report.dto.js';
import { UpdateManagementReportDto } from './dto/update-management-report.dto.js';
import { ManagementReportService } from './management-report.service.js';

@ApiTags('reports')
@Controller('reports')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class ManagementReportController {
  constructor(
    private readonly managementReportService: ManagementReportService,
  ) {}

  @Post()
  @RequireRoles(UserRole.ADMIN)
  createReport(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateManagementReportDto,
  ) {
    return this.managementReportService.createReport(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listReports(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListManagementReportQueryDto,
  ) {
    return this.managementReportService.listReports(viewer, query);
  }

  @Get(':reportId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getReport(
    @CurrentViewer() viewer: OperixViewer,
    @Param('reportId') reportId: string,
  ) {
    return this.managementReportService.getReport(viewer, reportId);
  }

  @Patch(':reportId')
  @RequireRoles(UserRole.ADMIN)
  updateReport(
    @CurrentViewer() viewer: OperixViewer,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateManagementReportDto,
  ) {
    return this.managementReportService.updateReport(viewer, reportId, dto);
  }

  @Post(':reportId/submit')
  @RequireRoles(UserRole.ADMIN)
  submitReport(
    @CurrentViewer() viewer: OperixViewer,
    @Param('reportId') reportId: string,
  ) {
    return this.managementReportService.submitReport(viewer, reportId);
  }

  @Post(':reportId/review')
  @RequireRoles(UserRole.SUPER_ADMIN)
  reviewReport(
    @CurrentViewer() viewer: OperixViewer,
    @Param('reportId') reportId: string,
    @Body() dto: ReviewManagementReportDto,
  ) {
    return this.managementReportService.reviewReport(viewer, reportId, dto);
  }
}
