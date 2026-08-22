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
    },
    taskAssignment: {
      create: jestApi.fn(),
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
      [
        'TASK-002',
        'Active Task',
        'IN_PROGRESS',
        'team-a',
        'EMP-001',
        'admin@example.com',
        'admin@example.com',
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
});
