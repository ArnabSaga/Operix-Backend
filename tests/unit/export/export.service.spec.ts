import { read, utils, type CellObject } from 'xlsx';
import {
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { SheetJsSpreadsheetAdapter } from '../../../src/shared/spreadsheet/adapters/sheetjs-spreadsheet.adapter';
import { SpreadsheetService } from '../../../src/shared/spreadsheet/spreadsheet.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import { ExportService } from '../../../src/modules/export/export.service';
import { ExportFormat } from '../../../src/modules/export/export.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const viewer: OperixViewer = {
  userId: 'super-a',
  role: UserRole.SUPER_ADMIN,
  status: UserStatus.ACTIVE,
  scope: {
    type: 'GLOBAL',
  },
};

describe('ExportService', () => {
  function createService() {
    const spreadsheetService = new SpreadsheetService(
      new SheetJsSpreadsheetAdapter(),
    );
    const state = {
      taskRows: [] as unknown[],
      memberPerformanceRows: [] as unknown[],
      teamPerformance: null as unknown,
      workload: null as unknown,
      trends: null as unknown,
      managementReports: [] as unknown[],
    };
    const taskService = {
      getTasksForExport: () => Promise.resolve(state.taskRows),
    };
    const performanceService = {
      getMemberPerformanceForExport: () =>
        Promise.resolve(state.memberPerformanceRows),
      getTeamPerformanceForExport: () => Promise.resolve(state.teamPerformance),
    };
    const dashboardService = {
      getWorkloadForExport: () => Promise.resolve(state.workload),
      getTrendsForExport: () => Promise.resolve(state.trends),
    };
    const managementReportService = {
      getManagementReportsForExport: () =>
        Promise.resolve(state.managementReports),
    };

    return {
      service: new ExportService(
        spreadsheetService,
        taskService as never,
        performanceService as never,
        dashboardService as never,
        managementReportService as never,
      ),
      taskService,
      performanceService,
      dashboardService,
      managementReportService,
      state,
    };
  }

  it('rejects unsupported export formats with the export error code', async () => {
    const { service } = createService();

    try {
      await service.exportTasks(viewer, {
        format: 'csv',
      });
      throw new Error('Expected export to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toMatchObject({
        code: APP_ERROR_CODE.EXPORT_FORMAT_NOT_SUPPORTED,
      });
    }
  });

  it('exports Tasks as xlsx with formula-safe text and metadata', async () => {
    const { service, state } = createService();
    const createdAt = new Date('2026-08-23T00:00:00.000Z');
    state.taskRows = [
      {
        id: 'task-a',
        referenceCode: 'LEG-1',
        title: '=HYPERLINK("x")',
        description: 'Safe description',
        remarks: null,
        priority: TaskPriority.HIGH,
        status: TaskStatus.COMPLETED,
        dueAt: null,
        startedAt: null,
        completedAt: createdAt,
        cancelledAt: null,
        teamId: 'team-a',
        categoryId: null,
        createdById: 'admin-a',
        createdAt,
        updatedAt: createdAt,
        isOverdue: false,
      },
    ];

    const result = await service.exportTasks(viewer, {
      format: ExportFormat.XLSX,
    });
    const workbook = read(result.buffer, {
      type: 'buffer',
      cellFormula: true,
      cellDates: true,
    });
    const taskSheet = workbook.Sheets.Tasks;

    if (!taskSheet) {
      throw new Error('Tasks sheet missing.');
    }

    const rows = utils.sheet_to_json<unknown[]>(taskSheet, {
      header: 1,
      raw: false,
    });

    expect(result.filename).toMatch(/^operix-tasks-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(rows[1]?.[2]).toBe('\'=HYPERLINK("x")');
    const taskFormulaCell = taskSheet.C2 as CellObject | undefined;

    expect(taskFormulaCell?.f).toBeUndefined();
    expect(workbook.SheetNames).toEqual(['Tasks', 'Metadata']);
  });

  it('keeps null performance metrics blank and numeric metrics numeric', async () => {
    const { service, state } = createService();
    state.memberPerformanceRows = [
      {
        member: {
          id: 'member-a',
          name: '+Name',
          employeeId: 'EMP-1',
          designation: 'Officer',
          status: UserStatus.ACTIVE,
          teamId: 'team-a',
          teamName: 'Team A',
        },
        performance: {
          totalTasks: 1,
          eligibleTasks: 0,
          completedTasks: 0,
          cancelledTasks: 1,
          completionRate: null,
          onTimeCompleted: 0,
          lateCompleted: 0,
          completedWithDeadline: 0,
          completedWithoutDeadline: 0,
          onTimeRate: null,
          revisionCount: 0,
          tasksWithRevision: 0,
          averageCompletionMinutes: null,
          completionTimeSampleCount: 0,
        },
        workload: {
          activeTasks: -5,
          overdueTasks: 0,
          statusCounts: Object.fromEntries(
            Object.values(TaskStatus).map((status) => [status, 0]),
          ),
          activePriorityCounts: Object.fromEntries(
            Object.values(TaskPriority).map((priority) => [priority, 0]),
          ),
        },
      },
    ];

    const result = await service.exportMemberPerformance(viewer, {});
    const workbook = read(result.buffer, {
      type: 'buffer',
      cellFormula: true,
      cellDates: true,
    });
    const sheet = workbook.Sheets['Member Performance'];

    if (!sheet) {
      throw new Error('Member Performance sheet missing.');
    }

    const nameCell = sheet.B2 as CellObject | undefined;
    const activeTasksCell = sheet.V2 as CellObject | undefined;

    expect(nameCell?.v).toBe("'+Name");
    expect(sheet.L2).toBeUndefined();
    expect(activeTasksCell?.v).toBe(-5);
    expect(activeTasksCell?.t).toBe('n');
  });
});
