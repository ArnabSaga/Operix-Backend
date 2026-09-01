import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ManagementReportReviewAction,
  ManagementReportStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { TEAM_ERROR_CODE } from '../team/team.constant.js';
import type { CreateManagementReportDto } from './dto/create-management-report.dto.js';
import type { ListManagementReportQueryDto } from './dto/list-management-report-query.dto.js';
import type { ReviewManagementReportDto } from './dto/review-management-report.dto.js';
import type { UpdateManagementReportDto } from './dto/update-management-report.dto.js';
import {
  MANAGEMENT_REPORT_ACTIVITY,
  MANAGEMENT_REPORT_ERROR_CODE,
  MANAGEMENT_REPORT_NOTIFICATION,
} from './management-report.constant.js';
import type {
  PaginatedManagementReportResponse,
  SafeManagementReportResponse,
} from './management-report.interface.js';
import { mapManagementReportResponse } from './management-report.mapper.js';
import { managementReportSelect } from './management-report.select.js';
import { buildManagementReportScopeWhere } from './policies/management-report-scope.policy.js';

const EDITABLE_REPORT_STATUSES = new Set<ManagementReportStatus>([
  ManagementReportStatus.DRAFT,
  ManagementReportStatus.REVISION_REQUIRED,
]);

const SUBMITTABLE_REPORT_STATUSES = new Set<ManagementReportStatus>([
  ManagementReportStatus.DRAFT,
  ManagementReportStatus.REVISION_REQUIRED,
]);

const REPORT_TEXT_FIELDS = [
  'operationalSummary',
  'completedWorkSummary',
  'pendingWorkSummary',
  'overdueWorkSummary',
  'performanceSummary',
  'keyIssues',
  'actionsTaken',
  'nextPeriodPlan',
  'remarks',
] as const;

type ReportTextField = (typeof REPORT_TEXT_FIELDS)[number];

@Injectable()
export class ManagementReportService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(
    viewer: OperixViewer,
    dto: CreateManagementReportDto,
  ): Promise<SafeManagementReportResponse> {
    this.assertRole(viewer, UserRole.ADMIN);
    assertValidPeriod(dto.periodStart, dto.periodEnd);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const teamId = await this.resolveAdminTeamId(
        tx,
        viewer.userId,
        dto.teamId,
      );

      const report = await tx.managementReport.create({
        data: {
          adminId: viewer.userId,
          teamId,
          title: dto.title,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          ...buildCreateTextData(dto),
        },
        select: managementReportSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: MANAGEMENT_REPORT_ACTIVITY.REPORT_CREATED,
        entityType: 'REPORT',
        entityId: report.id,
        metadata: {
          reportId: report.id,
          teamId: report.teamId,
          adminId: report.adminId,
        },
      });

      return mapManagementReportResponse(report);
    });
  }

  async listReports(
    viewer: OperixViewer,
    query: ListManagementReportQueryDto,
  ): Promise<PaginatedManagementReportResponse> {
    this.assertReadRole(viewer);
    const normalized = normalizePagination(query);
    const where = this.buildListWhere(viewer, query);

    const [reports, total] = await Promise.all([
      this.prisma.managementReport.findMany({
        where,
        select: managementReportSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.managementReport.count({ where }),
    ]);

    return {
      data: reports.map((report) => mapManagementReportResponse(report)),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getManagementReportsForExport(
    viewer: OperixViewer,
    query: Omit<ListManagementReportQueryDto, 'page' | 'limit'>,
    take: number,
  ): Promise<SafeManagementReportResponse[]> {
    this.assertReadRole(viewer);
    const where = this.buildListWhere(viewer, query);
    const reports = await this.prisma.managementReport.findMany({
      where,
      select: managementReportSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
    });

    return reports.map((report) => mapManagementReportResponse(report));
  }

  async getReport(
    viewer: OperixViewer,
    reportId: string,
  ): Promise<SafeManagementReportResponse> {
    this.assertReadRole(viewer);
    const report = await this.prisma.managementReport.findFirst({
      where: {
        publicId: reportId,
        AND: [buildManagementReportScopeWhere(viewer)],
      },
      select: managementReportSelect,
    });

    if (!report) {
      throw this.reportNotFound();
    }

    return mapManagementReportResponse(report);
  }

  async updateReport(
    viewer: OperixViewer,
    reportId: string,
    dto: UpdateManagementReportDto,
  ): Promise<SafeManagementReportResponse> {
    this.assertRole(viewer, UserRole.ADMIN);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const report = await tx.managementReport.findFirst({
        where: {
          publicId: reportId,
          adminId: viewer.userId,
        },
        select: managementReportSelect,
      });

      if (!report) {
        throw this.reportNotFound();
      }

      if (!EDITABLE_REPORT_STATUSES.has(report.status)) {
        throw this.reportNotEditable();
      }

      const updateData = buildUpdateData(report, dto);

      if (Object.keys(updateData).length === 0) {
        return mapManagementReportResponse(report);
      }

      const updated = await tx.managementReport.update({
        where: {
          publicId: reportId,
        },
        data: updateData,
        select: managementReportSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: MANAGEMENT_REPORT_ACTIVITY.REPORT_UPDATED,
        entityType: 'REPORT',
        entityId: report.id,
        metadata: {
          reportId,
          changedFields: Object.keys(updateData),
        },
      });

      return mapManagementReportResponse(updated);
    });
  }

  async submitReport(
    viewer: OperixViewer,
    reportId: string,
  ): Promise<SafeManagementReportResponse> {
    this.assertRole(viewer, UserRole.ADMIN);

    try {
      return await runSerializableTransaction(this.prisma, async (tx) => {
        const report = await tx.managementReport.findFirst({
          where: {
            publicId: reportId,
            adminId: viewer.userId,
          },
          select: {
            ...managementReportSelect,
            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
              select: {
                id: true,
                version: true,
                review: {
                  select: {
                    id: true,
                    action: true,
                  },
                },
              },
            },
          },
        });

        if (!report) {
          throw this.reportNotFound();
        }

        if (!SUBMITTABLE_REPORT_STATUSES.has(report.status)) {
          throw this.reportSubmissionNotAllowed();
        }

        assertReportReadyForSubmission(report);

        const [latestVersion] = report.versions;

        if (
          report.status === ManagementReportStatus.REVISION_REQUIRED &&
          (!latestVersion ||
            latestVersion.review?.action !==
              ManagementReportReviewAction.REQUEST_REVISION)
        ) {
          throw this.reportSubmissionNotAllowed();
        }

        const submittedAt = new Date();
        const nextVersion = (latestVersion?.version ?? 0) + 1;

        await tx.managementReportVersion.create({
          data: {
            reportId: report.id,
            version: nextVersion,
            title: report.title,
            periodStart: report.periodStart,
            periodEnd: report.periodEnd,
            operationalSummary: report.operationalSummary,
            completedWorkSummary: report.completedWorkSummary,
            pendingWorkSummary: report.pendingWorkSummary,
            overdueWorkSummary: report.overdueWorkSummary,
            performanceSummary: report.performanceSummary,
            keyIssues: report.keyIssues,
            actionsTaken: report.actionsTaken,
            nextPeriodPlan: report.nextPeriodPlan,
            remarks: report.remarks,
            submittedAt,
          },
        });

        const updated = await tx.managementReport.update({
          where: {
            publicId: reportId,
          },
          data: {
            status: ManagementReportStatus.SUBMITTED,
            submittedAt,
            approvedAt: null,
          },
          select: managementReportSelect,
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: MANAGEMENT_REPORT_ACTIVITY.REPORT_SUBMITTED,
          entityType: 'REPORT',
          entityId: report.id,
          metadata: {
            reportId,
            version: nextVersion,
            teamId: report.teamId,
            adminId: report.adminId,
          },
        });

        const superAdmins = await tx.user.findMany({
          where: {
            role: UserRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
          },
          select: {
            id: true,
          },
        });

        for (const superAdmin of superAdmins) {
          await createNotification(tx, {
            receiverId: superAdmin.id,
            actorId: viewer.userId,
            type: MANAGEMENT_REPORT_NOTIFICATION.REPORT_SUBMITTED,
            title: 'Management report submitted',
            body: 'A management report has been submitted for review.',
            targetType: 'REPORT',
            targetId: report.id,
          });
        }

        return mapManagementReportResponse(updated);
      });
    } catch (error) {
      throw mapReportSubmitConflict(error);
    }
  }

  async reviewReport(
    viewer: OperixViewer,
    reportId: string,
    dto: ReviewManagementReportDto,
  ): Promise<SafeManagementReportResponse> {
    this.assertRole(viewer, UserRole.SUPER_ADMIN);

    try {
      return await runSerializableTransaction(this.prisma, async (tx) => {
        const report = await tx.managementReport.findUnique({
          where: {
            publicId: reportId,
          },
          select: {
            id: true,
            adminId: true,
            status: true,
            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
              select: {
                id: true,
                version: true,
                review: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        if (!report) {
          throw this.reportNotFound();
        }

        if (report.status !== ManagementReportStatus.SUBMITTED) {
          throw this.reportReviewNotAllowed();
        }

        const [latestVersion] = report.versions;

        if (!latestVersion || latestVersion.review) {
          throw this.reportReviewNotAllowed();
        }

        const reviewStartedAt = new Date();
        const started = await tx.managementReport.updateMany({
          where: {
            publicId: reportId,
            status: ManagementReportStatus.SUBMITTED,
          },
          data: {
            status: ManagementReportStatus.UNDER_REVIEW,
          },
        });

        if (started.count !== 1) {
          throw this.reportReviewNotAllowed();
        }

        const decisionAt = createMonotonicDecisionDate(reviewStartedAt);
        await tx.managementReportReview.create({
          data: {
            reportVersionId: latestVersion.id,
            reviewerId: viewer.userId,
            action: dto.action,
            feedback: dto.feedback ?? null,
            reviewedAt: decisionAt,
          },
        });

        const finalStatus =
          dto.action === ManagementReportReviewAction.APPROVE
            ? ManagementReportStatus.APPROVED
            : ManagementReportStatus.REVISION_REQUIRED;

        const finalized = await tx.managementReport.updateMany({
          where: {
            publicId: reportId,
            status: ManagementReportStatus.UNDER_REVIEW,
          },
          data: {
            status: finalStatus,
            approvedAt:
              dto.action === ManagementReportReviewAction.APPROVE
                ? decisionAt
                : null,
          },
        });

        if (finalized.count !== 1) {
          throw this.reportReviewNotAllowed();
        }

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: MANAGEMENT_REPORT_ACTIVITY.REPORT_REVIEWED,
          entityType: 'REPORT',
          entityId: report.id,
          metadata: {
            reportId,
            reportVersionId: latestVersion.id,
            version: latestVersion.version,
            action: dto.action,
          },
        });

        await createNotification(tx, {
          receiverId: report.adminId,
          actorId: viewer.userId,
          type:
            dto.action === ManagementReportReviewAction.APPROVE
              ? MANAGEMENT_REPORT_NOTIFICATION.REPORT_APPROVED
              : MANAGEMENT_REPORT_NOTIFICATION.REPORT_REVISION_REQUESTED,
          title:
            dto.action === ManagementReportReviewAction.APPROVE
              ? 'Management report approved'
              : 'Management report revision requested',
          body:
            dto.action === ManagementReportReviewAction.APPROVE
              ? 'Your management report has been approved.'
              : 'Revision has been requested for your management report.',
          targetType: 'REPORT',
          targetId: report.id,
        });

        const updated = await tx.managementReport.findUniqueOrThrow({
          where: {
            publicId: reportId,
          },
          select: managementReportSelect,
        });

        return mapManagementReportResponse(updated);
      });
    } catch (error) {
      throw mapReportReviewConflict(error);
    }
  }

  private buildListWhere(
    viewer: OperixViewer,
    query: ListManagementReportQueryDto,
  ): Prisma.ManagementReportWhereInput {
    if (viewer.role === UserRole.ADMIN && query.adminId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this query.',
      );
    }

    const filters: Prisma.ManagementReportWhereInput[] = [];

    if (query.status) {
      filters.push({
        status: query.status,
      });
    }

    if (query.teamId) {
      filters.push({
        team: { publicId: query.teamId },
      });
    }

    if (query.adminId) {
      filters.push({
        admin: { publicId: query.adminId },
      });
    }

    if (query.q) {
      filters.push({
        title: {
          contains: query.q,
          mode: 'insensitive',
        },
      });
    }

    return {
      AND: [buildManagementReportScopeWhere(viewer), ...filters],
    };
  }

  private async resolveAdminTeamId(
    tx: PrismaTransactionClient,
    adminId: string,
    teamId: string,
  ): Promise<string> {
    const team = await tx.team.findFirst({
      where: {
        publicId: teamId,
        adminId,
      },
      select: {
        id: true,
      },
    });

    if (!team) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        TEAM_ERROR_CODE.TEAM_NOT_FOUND,
        'Team not found.',
      );
    }
    return team.id;
  }

  private assertReadRole(viewer: OperixViewer): void {
    if (viewer.role === UserRole.MEMBER) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private assertRole(viewer: OperixViewer, role: UserRole): void {
    if (viewer.role !== role) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private reportNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      MANAGEMENT_REPORT_ERROR_CODE.REPORT_NOT_FOUND,
      'Management report not found.',
    );
  }

  private reportNotEditable(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      MANAGEMENT_REPORT_ERROR_CODE.REPORT_NOT_EDITABLE,
      'Management report is not editable.',
    );
  }

  private reportSubmissionNotAllowed(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      MANAGEMENT_REPORT_ERROR_CODE.REPORT_SUBMISSION_NOT_ALLOWED,
      'Management report cannot be submitted in its current state.',
    );
  }

  private reportReviewNotAllowed(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      MANAGEMENT_REPORT_ERROR_CODE.REPORT_REVIEW_NOT_ALLOWED,
      'Management report cannot be reviewed in its current state.',
    );
  }
}

function buildCreateTextData(dto: CreateManagementReportDto) {
  return {
    operationalSummary: dto.operationalSummary ?? null,
    completedWorkSummary: dto.completedWorkSummary ?? null,
    pendingWorkSummary: dto.pendingWorkSummary ?? null,
    overdueWorkSummary: dto.overdueWorkSummary ?? null,
    performanceSummary: dto.performanceSummary ?? null,
    keyIssues: dto.keyIssues ?? null,
    actionsTaken: dto.actionsTaken ?? null,
    nextPeriodPlan: dto.nextPeriodPlan ?? null,
    remarks: dto.remarks ?? null,
  };
}

function buildUpdateData(
  report: {
    title: string;
    periodStart: Date;
    periodEnd: Date;
  } & Record<ReportTextField, string | null>,
  dto: UpdateManagementReportDto,
): Prisma.ManagementReportUpdateInput {
  const nextPeriodStart = dto.periodStart ?? report.periodStart;
  const nextPeriodEnd = dto.periodEnd ?? report.periodEnd;
  assertValidPeriod(nextPeriodStart, nextPeriodEnd);

  const data: Prisma.ManagementReportUpdateInput = {};

  if (dto.title !== undefined && dto.title !== report.title) {
    data.title = dto.title;
  }

  if (
    dto.periodStart !== undefined &&
    dto.periodStart.getTime() !== report.periodStart.getTime()
  ) {
    data.periodStart = dto.periodStart;
  }

  if (
    dto.periodEnd !== undefined &&
    dto.periodEnd.getTime() !== report.periodEnd.getTime()
  ) {
    data.periodEnd = dto.periodEnd;
  }

  for (const field of REPORT_TEXT_FIELDS) {
    if (dto[field] !== undefined && dto[field] !== report[field]) {
      data[field] = dto[field];
    }
  }

  return data;
}

function assertReportReadyForSubmission(report: {
  title: string;
  periodStart: Date;
  periodEnd: Date;
  operationalSummary: string | null;
}): asserts report is {
  title: string;
  periodStart: Date;
  periodEnd: Date;
  operationalSummary: string;
} {
  assertValidPeriod(report.periodStart, report.periodEnd);

  if (
    report.title.trim().length === 0 ||
    report.operationalSummary === null ||
    report.operationalSummary.trim().length === 0
  ) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.VALIDATION_ERROR,
      'Management report is missing required submission content.',
    );
  }
}

function assertValidPeriod(periodStart: Date, periodEnd: Date): void {
  if (periodStart.getTime() > periodEnd.getTime()) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.VALIDATION_ERROR,
      'periodStart must be earlier than or equal to periodEnd.',
    );
  }
}

function mapReportSubmitConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      APP_ERROR_CODE.CONCURRENT_MODIFICATION,
      'The resource changed while processing this request. Please retry.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}

function mapReportReviewConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      MANAGEMENT_REPORT_ERROR_CODE.REPORT_REVIEW_NOT_ALLOWED,
      'Management report cannot be reviewed in its current state.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}

function createMonotonicDecisionDate(reviewStartedAt: Date): Date {
  const decisionAt = new Date();

  if (decisionAt.getTime() <= reviewStartedAt.getTime()) {
    return new Date(reviewStartedAt.getTime() + 1);
  }

  return decisionAt;
}
