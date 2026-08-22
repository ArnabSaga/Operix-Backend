import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { SpreadsheetService } from '../../shared/spreadsheet/spreadsheet.service.js';
import { DashboardTrendDays } from '../dashboard/dashboard.constant.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { ManagementReportService } from '../management-report/management-report.service.js';
import { PerformanceService } from '../performance/performance.service.js';
import { TaskService } from '../task/task.service.js';
import { EXPORT_CONTENT_TYPE, EXPORT_LIMIT } from './export.constant.js';
import type {
  ExportFileResult,
  ExportMetadataInput,
  ExportWorkbook,
} from './export.interface.js';
import {
  assertWithinReadLimit,
  assertWorkbookWithinExportLimits,
  formatExportDate,
} from './export-workbook.helper.js';
import type { ExportDashboardTrendQueryDto } from './dto/export-dashboard-trend-query.dto.js';
import type { ExportFormatQueryDto } from './dto/export-format-query.dto.js';
import type { ExportManagementReportQueryDto } from './dto/export-management-report-query.dto.js';
import type { ExportMemberPerformanceQueryDto } from './dto/export-member-performance-query.dto.js';
import type { ExportTaskQueryDto } from './dto/export-task-query.dto.js';
import {
  buildDashboardTrendsExportWorkbook,
  buildDashboardWorkloadExportWorkbook,
} from './datasets/dashboard-export.dataset.js';
import { buildManagementReportExportWorkbook } from './datasets/management-report-export.dataset.js';
import { buildMemberPerformanceExportWorkbook } from './datasets/member-performance-export.dataset.js';
import { buildTaskExportWorkbook } from './datasets/task-export.dataset.js';
import { buildTeamPerformanceExportWorkbook } from './datasets/team-performance-export.dataset.js';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly spreadsheetService: SpreadsheetService,
    private readonly taskService: TaskService,
    private readonly performanceService: PerformanceService,
    private readonly dashboardService: DashboardService,
    private readonly managementReportService: ManagementReportService,
  ) {}

  async exportTasks(
    viewer: OperixViewer,
    query: ExportTaskQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const tasks = await this.taskService.getTasksForExport(
      viewer,
      query,
      now,
      EXPORT_LIMIT.MAX_ROWS_PER_SHEET + 1,
    );
    assertWithinReadLimit(tasks, 'Tasks');

    return this.writeWorkbook(
      buildTaskExportWorkbook(
        tasks,
        this.metadata(viewer, now, 'Task read scope', filters(query)),
      ),
      'operix-tasks',
      now,
      'TASKS',
      viewer,
    );
  }

  async exportMemberPerformance(
    viewer: OperixViewer,
    query: ExportMemberPerformanceQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const members = await this.performanceService.getMemberPerformanceForExport(
      viewer,
      query,
      now,
      EXPORT_LIMIT.MAX_ROWS_PER_SHEET + 1,
    );
    assertWithinReadLimit(members, 'Member Performance');

    return this.writeWorkbook(
      buildMemberPerformanceExportWorkbook(
        members,
        this.metadata(viewer, now, 'Performance member scope', filters(query)),
      ),
      'operix-member-performance',
      now,
      'MEMBER_PERFORMANCE',
      viewer,
    );
  }

  async exportTeamPerformance(
    viewer: OperixViewer,
    teamId: string,
    query: ExportFormatQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const result = await this.performanceService.getTeamPerformanceForExport(
      viewer,
      teamId,
      now,
    );

    return this.writeWorkbook(
      buildTeamPerformanceExportWorkbook(
        result,
        this.metadata(viewer, now, 'Performance team scope', {
          ...filters(query),
          teamId,
        }),
      ),
      'operix-team-performance',
      now,
      'TEAM_PERFORMANCE',
      viewer,
    );
  }

  async exportDashboardWorkload(
    viewer: OperixViewer,
    query: ExportFormatQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const workload = await this.dashboardService.getWorkloadForExport(
      viewer,
      now,
      EXPORT_LIMIT.MAX_ROWS_PER_SHEET + 1,
    );

    return this.writeWorkbook(
      buildDashboardWorkloadExportWorkbook(
        workload,
        this.metadata(
          viewer,
          now,
          'Dashboard workload role scope',
          filters(query),
        ),
      ),
      'operix-dashboard-workload',
      now,
      'DASHBOARD_WORKLOAD',
      viewer,
    );
  }

  async exportDashboardTrends(
    viewer: OperixViewer,
    query: ExportDashboardTrendQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const days = query.days ?? DashboardTrendDays.THIRTY;
    const trends = await this.dashboardService.getTrendsForExport(
      viewer,
      days,
      now,
    );

    return this.writeWorkbook(
      buildDashboardTrendsExportWorkbook(
        trends,
        this.metadata(viewer, now, 'Dashboard trend role scope', {
          ...filters(query),
          days,
        }),
      ),
      'operix-dashboard-trends',
      now,
      'DASHBOARD_TRENDS',
      viewer,
    );
  }

  async exportManagementReports(
    viewer: OperixViewer,
    query: ExportManagementReportQueryDto,
  ): Promise<ExportFileResult> {
    this.assertFormat(query);
    const now = new Date();
    const reports =
      await this.managementReportService.getManagementReportsForExport(
        viewer,
        query,
        EXPORT_LIMIT.MAX_ROWS_PER_SHEET + 1,
      );
    assertWithinReadLimit(reports, 'Management Reports');

    return this.writeWorkbook(
      buildManagementReportExportWorkbook(
        reports,
        this.metadata(
          viewer,
          now,
          'Management report authorship scope',
          filters(query),
        ),
      ),
      'operix-management-reports',
      now,
      'MANAGEMENT_REPORTS',
      viewer,
    );
  }

  private writeWorkbook(
    workbook: ExportWorkbook,
    filenamePrefix: string,
    now: Date,
    dataset: string,
    viewer: OperixViewer,
  ): ExportFileResult {
    assertWorkbookWithinExportLimits(workbook);

    try {
      return {
        buffer: this.spreadsheetService.write(workbook),
        filename: `${filenamePrefix}-${formatExportDate(now)}.xlsx`,
        contentType: EXPORT_CONTENT_TYPE,
      };
    } catch (error) {
      this.logger.error('XLSX export generation failed', {
        dataset,
        sheetCount: workbook.sheets.length,
        viewerRole: viewer.role,
        error,
      });

      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        APP_ERROR_CODE.EXPORT_GENERATION_FAILED,
        'Export generation failed.',
      );
    }
  }

  private assertFormat(query: ExportFormatQueryDto): void {
    if (query.format && query.format !== 'xlsx') {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.EXPORT_FORMAT_NOT_SUPPORTED,
        'Export format is not supported.',
      );
    }
  }

  private metadata(
    viewer: OperixViewer,
    now: Date,
    scope: string,
    effectiveFilters: Record<string, string | number | boolean | null>,
  ): Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'> {
    return {
      generatedAt: now,
      asOf: now,
      viewerRole: viewer.role,
      viewerId: viewer.userId,
      effectiveScope: scopeForViewer(viewer, scope),
      effectiveFilters,
    };
  }
}

function filters(
  query: object,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(query as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? value
          : null,
      ]),
  );
}

function scopeForViewer(viewer: OperixViewer, label: string): string {
  if (viewer.scope.type === 'ADMIN') {
    return `${label}; assigned teams: ${viewer.scope.teamIds.length}`;
  }

  if (viewer.scope.type === 'MEMBER') {
    return `${label}; current member only`;
  }

  return `${label}; organization wide`;
}
