/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  ManagementReportReviewAction,
  ManagementReportStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import type { PrismaService } from '../../../src/database/prisma.service';
import { ReviewManagementReportDto } from '../../../src/modules/management-report/dto/review-management-report.dto';
import {
  MANAGEMENT_REPORT_ACTIVITY,
  MANAGEMENT_REPORT_ERROR_CODE,
  MANAGEMENT_REPORT_NOTIFICATION,
} from '../../../src/modules/management-report/management-report.constant';
import { ManagementReportService } from '../../../src/modules/management-report/management-report.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { TEAM_ERROR_CODE } from '../../../src/modules/team/team.constant';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

const jestApi = import.meta.jest;
const fixedDate = new Date('2026-08-22T08:00:00.000Z');

function createViewer(role: UserRole = UserRole.ADMIN): OperixViewer {
  return {
    userId:
      role === UserRole.ADMIN
        ? 'admin-a'
        : role === UserRole.SUPER_ADMIN
          ? 'super-a'
          : 'member-a',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : role === UserRole.ADMIN
          ? { type: 'ADMIN', teamIds: ['team-a'] }
          : { type: 'MEMBER', teamId: 'team-a' },
  };
}

function createReport(overrides: Record<string, unknown> = {}) {
  const report = {
    id: 'report-a',
    adminId: 'admin-a',
    teamId: 'team-a',
    title: 'August Operational Review',
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    operationalSummary: 'Operations were steady.',
    completedWorkSummary: null,
    pendingWorkSummary: null,
    overdueWorkSummary: null,
    performanceSummary: null,
    keyIssues: null,
    actionsTaken: null,
    nextPeriodPlan: null,
    remarks: null,
    status: ManagementReportStatus.DRAFT,
    submittedAt: null,
    approvedAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    versions: [],
    ...overrides,
  };
  Object.defineProperties(report, {
    publicId: { value: report.id, enumerable: false },
    admin: { value: { publicId: report.adminId }, enumerable: false },
    team: { value: { publicId: report.teamId }, enumerable: false },
  });
  for (const version of report.versions as {
    review?: Record<string, unknown> | null;
  }[]) {
    if (version.review) {
      Object.defineProperty(version.review, 'reviewer', {
        value: { publicId: version.review.reviewerId },
        enumerable: false,
      });
    }
  }
  return report;
}

function createVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-a',
    reportId: 'report-a',
    version: 1,
    submittedAt: fixedDate,
    createdAt: fixedDate,
    review: null,
    ...overrides,
  };
}

function createReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-a',
    reportVersionId: 'version-a',
    reviewerId: 'super-a',
    action: ManagementReportReviewAction.REQUEST_REVISION,
    feedback: 'Please revise.',
    reviewedAt: fixedDate,
    createdAt: fixedDate,
    ...overrides,
  };
}

function createKnownRequestError(code: string): Error {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
}

function createTx(
  input: {
    report?: unknown;
    team?: unknown;
    updatedReport?: unknown;
    latestReport?: unknown;
    superAdmins?: { id: string }[];
    updateManyCount?: number;
    versionCreateError?: Error;
    reviewCreateError?: Error;
  } = {},
) {
  return {
    team: {
      findFirst: jestApi
        .fn()
        .mockResolvedValue(
          Object.hasOwn(input, 'team') ? input.team : { id: 'team-a' },
        ),
    },
    user: {
      findMany: jestApi
        .fn()
        .mockResolvedValue(input.superAdmins ?? [{ id: 'super-a' }]),
    },
    managementReport: {
      create: jestApi.fn().mockResolvedValue(input.report ?? createReport()),
      findFirst: jestApi.fn().mockResolvedValue(input.report ?? createReport()),
      findUnique: jestApi
        .fn()
        .mockResolvedValue(input.report ?? createReport()),
      findMany: jestApi
        .fn()
        .mockResolvedValue([input.report ?? createReport()]),
      count: jestApi.fn().mockResolvedValue(1),
      update: jestApi
        .fn()
        .mockResolvedValue(input.updatedReport ?? createReport()),
      updateMany: jestApi
        .fn()
        .mockResolvedValue({ count: input.updateManyCount ?? 1 }),
      findUniqueOrThrow: jestApi
        .fn()
        .mockResolvedValue(input.latestReport ?? createReport()),
    },
    managementReportVersion: {
      create: input.versionCreateError
        ? jestApi.fn().mockRejectedValue(input.versionCreateError)
        : jestApi.fn().mockResolvedValue(createVersion()),
    },
    managementReportReview: {
      create: input.reviewCreateError
        ? jestApi.fn().mockRejectedValue(input.reviewCreateError)
        : jestApi.fn().mockResolvedValue(createReview()),
    },
    activityLog: {
      create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
    },
    notification: {
      create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
    },
  };
}

function createService(tx: ReturnType<typeof createTx>) {
  const transaction = jestApi.fn(
    (callback: (transaction: ReturnType<typeof createTx>) => unknown) =>
      callback(tx),
  );
  const prisma = {
    $transaction: transaction,
    managementReport: tx.managementReport,
  } as unknown as PrismaService;

  return {
    service: new ManagementReportService(prisma),
    transaction,
  };
}

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

async function expectRejectsAppException(
  promise: Promise<unknown>,
  input: {
    status: number;
    code: string;
  },
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject.');
  } catch (error) {
    expectAppException(error, input);
  }
}

describe('ReviewManagementReportDto', () => {
  it('requires revision feedback and rejects blank approval feedback', () => {
    const missingRevision = plainToInstance(ReviewManagementReportDto, {
      action: ManagementReportReviewAction.REQUEST_REVISION,
    });
    const blankRevision = plainToInstance(ReviewManagementReportDto, {
      action: ManagementReportReviewAction.REQUEST_REVISION,
      feedback: '   ',
    });
    const blankApproval = plainToInstance(ReviewManagementReportDto, {
      action: ManagementReportReviewAction.APPROVE,
      feedback: '   ',
    });
    const approvalWithoutFeedback = plainToInstance(ReviewManagementReportDto, {
      action: ManagementReportReviewAction.APPROVE,
    });

    expect(validateSync(missingRevision)).toHaveLength(1);
    expect(validateSync(blankRevision)).toHaveLength(1);
    expect(validateSync(blankApproval)).toHaveLength(1);
    expect(validateSync(approvalWithoutFeedback)).toHaveLength(0);
  });
});

describe('ManagementReportService', () => {
  it('creates a draft report for an Admin owned Team and writes activity', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    const result = await service.createReport(createViewer(), {
      teamId: 'team-a',
      title: 'August Operational Review',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    });

    expect(result.status).toBe(ManagementReportStatus.DRAFT);
    expect(tx.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: 'team-a',
          adminId: 'admin-a',
        },
      }),
    );
    expect(tx.managementReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminId: 'admin-a',
          teamId: 'team-a',
        }),
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MANAGEMENT_REPORT_ACTIVITY.REPORT_CREATED,
          entityType: 'REPORT',
          entityId: 'report-a',
        }),
      }),
    );
  });

  it('rejects creating a report for a non owned Team', async () => {
    const tx = createTx({ team: null });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.createReport(createViewer(), {
        teamId: 'team-b',
        title: 'August Operational Review',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      }),
      {
        status: HttpStatus.NOT_FOUND,
        code: TEAM_ERROR_CODE.TEAM_NOT_FOUND,
      },
    );
  });

  it('blocks non Admin report creation before transaction', async () => {
    const tx = createTx();
    const { service, transaction } = createService(tx);

    await expectRejectsAppException(
      service.createReport(createViewer(UserRole.SUPER_ADMIN), {
        teamId: 'team-a',
        title: 'August Operational Review',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      }),
      {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      },
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns no op update without writing activity', async () => {
    const report = createReport();
    const tx = createTx({ report });
    const { service } = createService(tx);

    const result = await service.updateReport(createViewer(), 'report-a', {
      title: 'August Operational Review',
      operationalSummary: 'Operations were steady.',
    });

    expect(result.id).toBe('report-a');
    expect(tx.managementReport.update).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it('validates resulting PATCH period and editable status', async () => {
    const tx = createTx({
      report: createReport({
        status: ManagementReportStatus.SUBMITTED,
      }),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.updateReport(createViewer(), 'report-a', {
        title: 'Changed',
      }),
      {
        status: HttpStatus.CONFLICT,
        code: MANAGEMENT_REPORT_ERROR_CODE.REPORT_NOT_EDITABLE,
      },
    );
  });

  it('submits a draft as immutable version and notifies active Super Admins', async () => {
    const submittedReport = createReport({
      status: ManagementReportStatus.SUBMITTED,
      submittedAt: fixedDate,
      versions: [createVersion()],
    });
    const tx = createTx({
      report: createReport(),
      updatedReport: submittedReport,
      superAdmins: [{ id: 'super-a' }, { id: 'super-b' }],
    });
    const { service } = createService(tx);

    const result = await service.submitReport(createViewer(), 'report-a');

    expect(result.status).toBe(ManagementReportStatus.SUBMITTED);
    expect(tx.managementReportVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: 'report-a',
          version: 1,
          operationalSummary: 'Operations were steady.',
          submittedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.managementReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ManagementReportStatus.SUBMITTED,
          submittedAt: expect.any(Date),
          approvedAt: null,
        }),
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MANAGEMENT_REPORT_ACTIVITY.REPORT_SUBMITTED,
          metadata: expect.not.objectContaining({
            operationalSummary: expect.anything(),
          }),
        }),
      }),
    );
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiverId: 'super-a',
          type: MANAGEMENT_REPORT_NOTIFICATION.REPORT_SUBMITTED,
          targetType: 'REPORT',
          targetId: 'report-a',
        }),
      }),
    );
  });

  it('rejects draft submission without operational summary', async () => {
    const tx = createTx({
      report: createReport({
        operationalSummary: null,
      }),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.submitReport(createViewer(), 'report-a'),
      {
        status: HttpStatus.BAD_REQUEST,
        code: APP_ERROR_CODE.VALIDATION_ERROR,
      },
    );
    expect(tx.managementReportVersion.create).not.toHaveBeenCalled();
  });

  it('requires latest version revision review before resubmission', async () => {
    const tx = createTx({
      report: createReport({
        status: ManagementReportStatus.REVISION_REQUIRED,
        versions: [
          createVersion({
            review: createReview({
              action: ManagementReportReviewAction.APPROVE,
            }),
          }),
        ],
      }),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.submitReport(createViewer(), 'report-a'),
      {
        status: HttpStatus.CONFLICT,
        code: MANAGEMENT_REPORT_ERROR_CODE.REPORT_SUBMISSION_NOT_ALLOWED,
      },
    );
  });

  it('maps submit version races to concurrent modification', async () => {
    const tx = createTx({
      versionCreateError: createKnownRequestError('P2002'),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.submitReport(createViewer(), 'report-a'),
      {
        status: HttpStatus.CONFLICT,
        code: APP_ERROR_CODE.CONCURRENT_MODIFICATION,
      },
    );
  });

  it('reviews the latest submitted version and approves the report', async () => {
    const approvedReport = createReport({
      status: ManagementReportStatus.APPROVED,
      approvedAt: fixedDate,
      versions: [
        createVersion({
          review: createReview({
            action: ManagementReportReviewAction.APPROVE,
            feedback: 'Looks good.',
          }),
        }),
      ],
    });
    const tx = createTx({
      report: createReport({
        status: ManagementReportStatus.SUBMITTED,
        versions: [createVersion()],
      }),
      latestReport: approvedReport,
    });
    const { service } = createService(tx);

    const result = await service.reviewReport(
      createViewer(UserRole.SUPER_ADMIN),
      'report-a',
      {
        action: ManagementReportReviewAction.APPROVE,
        feedback: 'Looks good.',
      },
    );

    expect(result.status).toBe(ManagementReportStatus.APPROVED);
    expect(tx.managementReport.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          publicId: 'report-a',
          status: ManagementReportStatus.SUBMITTED,
        },
        data: {
          status: ManagementReportStatus.UNDER_REVIEW,
        },
      }),
    );
    expect(tx.managementReport.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          publicId: 'report-a',
          status: ManagementReportStatus.UNDER_REVIEW,
        },
        data: expect.objectContaining({
          status: ManagementReportStatus.APPROVED,
          approvedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.managementReportReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportVersionId: 'version-a',
          reviewerId: 'super-a',
          action: ManagementReportReviewAction.APPROVE,
          feedback: 'Looks good.',
        }),
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MANAGEMENT_REPORT_ACTIVITY.REPORT_REVIEWED,
          entityType: 'REPORT',
          metadata: expect.not.objectContaining({
            feedback: expect.anything(),
          }),
        }),
      }),
    );
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiverId: 'admin-a',
          type: MANAGEMENT_REPORT_NOTIFICATION.REPORT_APPROVED,
          body: 'Your management report has been approved.',
        }),
      }),
    );
  });

  it('requests revision without duplicating exact feedback in notification', async () => {
    const tx = createTx({
      report: createReport({
        status: ManagementReportStatus.SUBMITTED,
        versions: [createVersion()],
      }),
    });
    const { service } = createService(tx);

    await service.reviewReport(createViewer(UserRole.SUPER_ADMIN), 'report-a', {
      action: ManagementReportReviewAction.REQUEST_REVISION,
      feedback: 'Exact private review feedback.',
    });

    expect(tx.managementReport.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          status: ManagementReportStatus.REVISION_REQUIRED,
          approvedAt: null,
        },
      }),
    );
    expect(tx.notification.create.mock.calls[0][0].data.body).not.toContain(
      'Exact private review feedback.',
    );
  });

  it('rejects repeat review or invalid review state', async () => {
    const tx = createTx({
      report: createReport({
        status: ManagementReportStatus.SUBMITTED,
        versions: [
          createVersion({
            review: createReview(),
          }),
        ],
      }),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.reviewReport(createViewer(UserRole.SUPER_ADMIN), 'report-a', {
        action: ManagementReportReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.CONFLICT,
        code: MANAGEMENT_REPORT_ERROR_CODE.REPORT_REVIEW_NOT_ALLOWED,
      },
    );
  });

  it('enforces list scope and Admin query permissions', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    await service.listReports(createViewer(), {
      status: ManagementReportStatus.DRAFT,
      teamId: 'team-a',
      q: 'august',
    });

    expect(tx.managementReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              adminId: 'admin-a',
            },
            {
              status: ManagementReportStatus.DRAFT,
            },
            {
              team: { publicId: 'team-a' },
            },
            {
              title: {
                contains: 'august',
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );

    await expectRejectsAppException(
      service.listReports(createViewer(), {
        adminId: 'admin-b',
      }),
      {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      },
    );
  });
});
