import { HttpStatus } from '@nestjs/common';
import { utils, write } from 'xlsx';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { ProfileRecognizer } from '../../../src/modules/import/analyzers/profile-recognizer';
import { IMPORT_TYPE } from '../../../src/modules/import/import.constant';
import { ImportErrorReportService } from '../../../src/modules/import/import-error-report.service';
import { ImportService } from '../../../src/modules/import/import.service';
import { ImportProfileRegistry } from '../../../src/modules/import/profiles/import-profile.registry';
import { SheetJsSpreadsheetAdapter } from '../../../src/shared/spreadsheet/adapters/sheetjs-spreadsheet.adapter';
import { SPREADSHEET_MIME_TYPE } from '../../../src/shared/spreadsheet/spreadsheet.constant';
import { SpreadsheetService } from '../../../src/shared/spreadsheet/spreadsheet.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

function viewer(role: UserRole = UserRole.SUPER_ADMIN): OperixViewer {
  return {
    userId: 'chief-a',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : { type: 'ADMIN', teamIds: ['team-a'] },
  };
}

function createService(prismaOverrides = {}) {
  const prisma = {
    $transaction: jestApi.fn((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
    ),
    user: {
      findMany: jestApi.fn().mockResolvedValue([]),
      create: jestApi.fn(),
      update: jestApi.fn(),
    },
    team: {
      findMany: jestApi.fn().mockResolvedValue([]),
      create: jestApi.fn(),
      update: jestApi.fn(),
    },
    task: {
      findMany: jestApi.fn().mockResolvedValue([]),
      create: jestApi.fn(),
      update: jestApi.fn(),
      createManyAndReturn: jestApi.fn().mockResolvedValue([]),
    },
    taskAssignment: {
      create: jestApi.fn(),
      createMany: jestApi.fn().mockResolvedValue({ count: 0 }),
    },
    taskStatusHistory: {
      createMany: jestApi.fn().mockResolvedValue({ count: 0 }),
    },
    activityLog: {
      create: jestApi.fn(),
    },
    notification: {
      create: jestApi.fn(),
    },
    ...prismaOverrides,
  };
  const spreadsheet = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
  const service = new ImportService(
    prisma as never,
    spreadsheet,
    new ProfileRecognizer(new ImportProfileRegistry()),
    new ImportErrorReportService(spreadsheet),
  );

  return { service, prisma };
}

function workbookFile(
  sheetName: string,
  rows: unknown[][],
): Express.Multer.File {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), sheetName);
  const buffer = write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    fieldname: 'file',
    originalname: 'import.xlsx',
    encoding: '7bit',
    mimetype: SPREADSHEET_MIME_TYPE,
    size: buffer.length,
    buffer,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

function expectAppException(
  error: unknown,
  status: number,
  code: string,
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toMatchObject({ code });
}

interface MockCallReader<TArgument> {
  mock: {
    calls: [TArgument][];
  };
}

function firstMockArg<TArgument>(mock: unknown): TArgument {
  return (mock as MockCallReader<TArgument>).mock.calls[0]![0];
}

describe('ImportService', () => {
  it('requires Super Admin for previews', async () => {
    const { service } = createService();

    await service
      .preview(viewer(UserRole.ADMIN), IMPORT_TYPE.MEMBER, undefined)
      .catch((error: unknown) =>
        expectAppException(error, HttpStatus.FORBIDDEN, 'FORBIDDEN'),
      );
  });

  it('returns member preview with mutually exclusive counters and no writes', async () => {
    const file = workbookFile('Members', [
      ['Employee ID', 'Email', 'Team ID', 'Designation'],
      ['EMP-001', 'member@example.com', 'team-a', 'Senior Associate'],
      ['EMP-002', 'missing@example.com', 'team-a', 'Officer'],
      ['', '', '', ''],
    ]);
    const { service, prisma } = createService({
      user: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            id: 'member-a',
            employeeId: 'EMP-001',
            email: 'member@example.com',
            designation: 'Associate',
            teamMembership: { teamId: 'team-a' },
          },
        ]),
        create: jestApi.fn(),
        update: jestApi.fn(),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'team-a' }]),
        create: jestApi.fn(),
        update: jestApi.fn(),
      },
    });

    const preview = await service.preview(viewer(), IMPORT_TYPE.MEMBER, file);

    expect(preview.mappingProfile).toBe('MEMBER_LEGACY_V1');
    expect(preview.summary).toMatchObject({
      sourceRowCount: 3,
      consideredRows: 2,
      ignoredRows: 1,
      candidateRows: 0,
      candidateUpdateRows: 1,
      alreadyPresentRows: 0,
      invalidRows: 1,
      conflictRows: 0,
    });
    expect(preview.canImport).toBe(false);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported profile without using filename as identity', async () => {
    const { service } = createService();
    const file = workbookFile('Random', [['A'], ['B']]);

    await service
      .preview(viewer(), IMPORT_TYPE.MEMBER, file)
      .catch((error: unknown) =>
        expectAppException(
          error,
          HttpStatus.BAD_REQUEST,
          'IMPORT_PROFILE_NOT_FOUND',
        ),
      );
  });

  it('generates error report even when canImport is true', async () => {
    const file = workbookFile('Members', [
      ['Employee ID', 'Email', 'Team ID', 'Designation'],
      ['EMP-001', 'member@example.com', 'team-a', 'Associate'],
    ]);
    const { service } = createService({
      user: {
        findMany: jestApi.fn().mockResolvedValue([
          {
            id: 'member-a',
            employeeId: 'EMP-001',
            email: 'member@example.com',
            designation: 'Associate',
            teamMembership: { teamId: 'team-a' },
          },
        ]),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'team-a' }]),
      },
    });

    const report = await service.errorReport(
      viewer(),
      IMPORT_TYPE.MEMBER,
      file,
    );

    expect(report.filename).toContain('operix-member-import-errors-');
    expect(report.buffer.length).toBeGreaterThan(0);
  });

  it('previews terminal historical Tasks and rejects active statuses', async () => {
    const file = workbookFile('Tasks', [
      [
        'Task Reference',
        'Title',
        'Status',
        'Team ID',
        'Member Employee ID',
        'Created By Email',
        'Assigned By Email',
        'Created At',
        'Assigned At',
        'Completed At',
      ],
      [
        'TASK-001',
        'Historical Task',
        'COMPLETED',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-19T08:00:00Z',
        '2026-08-19T09:00:00Z',
        '2026-08-20T10:00:00Z',
      ],
      [
        'TASK-002',
        'Active Task',
        'IN_PROGRESS',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-19T08:00:00Z',
        '2026-08-19T09:00:00Z',
        '',
      ],
    ]);
    const { service, prisma } = createService({
      user: {
        findMany: jestApi
          .fn()
          .mockResolvedValueOnce([{ id: 'member-a', employeeId: 'EMP-001' }])
          .mockResolvedValueOnce([
            { id: 'admin-a', email: 'admin@example.com' },
          ]),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'team-a' }]),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValue([]),
        create: jestApi.fn(),
        update: jestApi.fn(),
      },
    });

    const preview = await service.preview(
      viewer(),
      IMPORT_TYPE.HISTORICAL_TASK,
      file,
    );

    expect(preview.mappingProfile).toBe('HISTORICAL_TASK_LEGACY_V1');
    expect(preview.summary).toMatchObject({
      consideredRows: 2,
      candidateRows: 1,
      invalidRows: 1,
    });
    expect(preview.issues[0]).toMatchObject({
      code: 'HISTORICAL_STATUS_NOT_SUPPORTED',
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('requires Created At and Assigned At for executable historical candidates', async () => {
    const file = workbookFile('Tasks', [
      [
        'Task Reference',
        'Title',
        'Status',
        'Team ID',
        'Member Employee ID',
        'Created By Email',
        'Assigned By Email',
        'Completed At',
      ],
      [
        'TASK-001',
        'Historical Task',
        'COMPLETED',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-20T10:00:00Z',
      ],
    ]);
    const { service } = createService();

    const preview = await service.preview(
      viewer(),
      IMPORT_TYPE.HISTORICAL_TASK,
      file,
    );

    expect(preview.summary).toMatchObject({
      candidateRows: 0,
      invalidRows: 1,
    });
    expect(preview.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'HISTORICAL_CREATED_AT_REQUIRED',
        'HISTORICAL_ASSIGNED_AT_REQUIRED',
      ]),
    );
  });

  it('blocks historical Task execution when analysis has invalid rows', async () => {
    const file = workbookFile('Tasks', [
      [
        'Task Reference',
        'Title',
        'Status',
        'Team ID',
        'Member Employee ID',
        'Created By Email',
        'Assigned By Email',
        'Created At',
        'Assigned At',
      ],
      [
        'TASK-001',
        'Active Task',
        'IN_PROGRESS',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-19T08:00:00Z',
        '2026-08-19T09:00:00Z',
      ],
    ]);
    const { service, prisma } = createService();

    await service
      .importHistoricalTasks(viewer(), file)
      .catch((error: unknown) =>
        expectAppException(
          error,
          HttpStatus.CONFLICT,
          'IMPORT_EXECUTION_BLOCKED',
        ),
      );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.createManyAndReturn).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('executes COMPLETED and CANCELLED historical Task imports atomically', async () => {
    const file = workbookFile('Tasks', [
      [
        'Task Reference',
        'Title',
        'Status',
        'Team ID',
        'Member Employee ID',
        'Created By Email',
        'Assigned By Email',
        'Created At',
        'Assigned At',
        'Started At',
        'Completed At',
        'Cancelled At',
      ],
      [
        'TASK-001',
        'Completed Historical Task',
        'COMPLETED',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-18T08:00:00Z',
        '2026-08-18T09:00:00Z',
        '2026-08-18T10:00:00Z',
        '2026-08-20T10:00:00Z',
        '',
      ],
      [
        'TASK-002',
        'Cancelled Historical Task',
        'CANCELLED',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        '2026-08-17T08:00:00Z',
        '2026-08-17T09:00:00Z',
        '',
        '',
        '2026-08-19T10:00:00Z',
      ],
    ]);
    const { service, prisma } = createService({
      user: {
        findMany: jestApi
          .fn()
          .mockResolvedValueOnce([{ id: 'member-a', employeeId: 'EMP-001' }])
          .mockResolvedValueOnce([
            { id: 'admin-a', email: 'admin@example.com' },
          ]),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'team-a' }]),
      },
      task: {
        findMany: jestApi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        createManyAndReturn: jestApi.fn().mockResolvedValue([
          { id: 'task-a', referenceCode: 'TASK-001' },
          { id: 'task-b', referenceCode: 'TASK-002' },
        ]),
      },
      taskAssignment: {
        createMany: jestApi.fn().mockResolvedValue({ count: 2 }),
      },
      taskStatusHistory: {
        createMany: jestApi.fn().mockResolvedValue({ count: 2 }),
      },
    });

    const result = await service.importHistoricalTasks(viewer(), file);

    expect(result.summary).toMatchObject({
      sourceRowCount: 2,
      consideredRows: 2,
      ignoredRows: 0,
      importedRows: 2,
      alreadyPresentRows: 0,
    });
    expect(result.verification).toEqual({
      tasksCreated: 2,
      assignmentsCreated: 2,
      historyRowsCreated: 2,
    });
    const taskCreateArg = firstMockArg<{
      data: {
        referenceCode: string;
        status: string;
        createdById?: string;
        startedAt?: Date | null;
        cancelledAt?: Date | null;
      }[];
    }>(prisma.task.createManyAndReturn);
    expect(taskCreateArg.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceCode: 'TASK-001',
          status: 'COMPLETED',
          createdById: 'admin-a',
          startedAt: new Date('2026-08-18T10:00:00Z'),
        }),
        expect.objectContaining({
          referenceCode: 'TASK-002',
          status: 'CANCELLED',
          cancelledAt: new Date('2026-08-19T10:00:00Z'),
        }),
      ]),
    );

    const assignmentArg = firstMockArg<{
      data: {
        taskId: string;
        memberId: string;
        assignedById: string;
        assignedAt: Date;
        unassignedAt: Date | null;
      }[];
    }>(prisma.taskAssignment.createMany);
    expect(assignmentArg.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'task-a',
          memberId: 'member-a',
          assignedById: 'admin-a',
          assignedAt: new Date('2026-08-18T09:00:00Z'),
          unassignedAt: null,
        }),
      ]),
    );

    const historyArg = firstMockArg<{
      data: {
        taskId: string;
        fromStatus: string | null;
        toStatus: string;
        changedById: string;
      }[];
    }>(prisma.taskStatusHistory.createMany);
    expect(historyArg.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'task-a',
          fromStatus: null,
          toStatus: 'COMPLETED',
          changedById: 'chief-a',
        }),
      ]),
    );

    const activityArg = firstMockArg<{
      data: {
        actorId: string;
        action: string;
        entityType: string;
        entityId: string | null;
        metadata: {
          mappingProfile: string;
          importedRows: number;
        };
      };
    }>(prisma.activityLog.create);
    expect(activityArg.data).toMatchObject({
      actorId: 'chief-a',
      action: 'HISTORICAL_TASKS_IMPORTED',
      entityType: 'IMPORT',
      entityId: null,
      metadata: {
        mappingProfile: 'HISTORICAL_TASK_LEGACY_V1',
        importedRows: 2,
      },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('reruns exact historical import as no op with no Activity', async () => {
    const createdAt = new Date('2026-08-18T08:00:00Z');
    const assignedAt = new Date('2026-08-18T09:00:00Z');
    const startedAt = new Date('2026-08-18T10:00:00Z');
    const completedAt = new Date('2026-08-20T10:00:00Z');
    const file = workbookFile('Tasks', [
      [
        'Task Reference',
        'Title',
        'Status',
        'Team ID',
        'Member Employee ID',
        'Created By Email',
        'Assigned By Email',
        'Created At',
        'Assigned At',
        'Started At',
        'Completed At',
      ],
      [
        'TASK-001',
        'Completed Historical Task',
        'COMPLETED',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
        createdAt.toISOString(),
        assignedAt.toISOString(),
        startedAt.toISOString(),
        completedAt.toISOString(),
      ],
    ]);
    const { service, prisma } = createService({
      user: {
        findMany: jestApi
          .fn()
          .mockResolvedValueOnce([{ id: 'member-a', employeeId: 'EMP-001' }])
          .mockResolvedValueOnce([
            { id: 'admin-a', email: 'admin@example.com' },
          ]),
      },
      team: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'team-a' }]),
      },
      task: {
        findMany: jestApi.fn().mockResolvedValueOnce([
          {
            id: 'task-a',
            referenceCode: 'TASK-001',
            title: 'Completed Historical Task',
            description: null,
            remarks: null,
            priority: 'MEDIUM',
            status: 'COMPLETED',
            teamId: 'team-a',
            createdById: 'admin-a',
            createdAt,
            startedAt,
            dueAt: null,
            completedAt,
            cancelledAt: null,
            assignments: [
              {
                memberId: 'member-a',
                assignedById: 'admin-a',
                assignedAt,
                unassignedAt: null,
              },
            ],
          },
        ]),
      },
    });

    const result = await service.importHistoricalTasks(viewer(), file);

    expect(result.summary).toMatchObject({
      importedRows: 0,
      alreadyPresentRows: 1,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
});
