import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { ListActivityQueryDto } from './dto/list-activity-query.dto.js';
import type { PaginatedActivityResponse } from './activity.interface.js';
import { activitySelect } from './activity.select.js';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async listActivities(
    viewer: OperixViewer,
    query: ListActivityQueryDto,
  ): Promise<PaginatedActivityResponse> {
    const normalized = normalizePagination(query);
    const visibility = await this.buildVisibilityWhere(viewer);
    const filters = this.buildFilterWhere(viewer, query);
    const where: Prisma.ActivityLogWhereInput = {
      AND: [visibility, ...filters],
    };

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        select: activitySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data,
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  private async buildVisibilityWhere(
    viewer: OperixViewer,
  ): Promise<Prisma.ActivityLogWhereInput> {
    if (viewer.role === UserRole.SUPER_ADMIN) {
      return {};
    }

    if (viewer.role === UserRole.ADMIN) {
      const teamIds = viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [];
      const [memberRows, taskRows, reportRows] = await Promise.all([
        this.prisma.teamMember.findMany({
          where: {
            teamId: {
              in: teamIds,
            },
          },
          select: {
            memberId: true,
          },
        }),
        this.prisma.task.findMany({
          where: {
            teamId: {
              in: teamIds,
            },
          },
          select: {
            id: true,
          },
        }),
        this.prisma.managementReport.findMany({
          where: {
            adminId: viewer.userId,
          },
          select: {
            id: true,
          },
        }),
      ]);
      const memberIds = memberRows.map((row) => row.memberId);
      const taskIds = taskRows.map((row) => row.id);
      const reportIds = reportRows.map((row) => row.id);

      return {
        OR: [
          {
            actorId: {
              in: [viewer.userId, ...memberIds],
            },
          },
          {
            entityType: 'USER',
            entityId: {
              in: memberIds,
            },
          },
          {
            entityType: 'TEAM',
            entityId: {
              in: teamIds,
            },
          },
          {
            entityType: 'TASK',
            entityId: {
              in: taskIds,
            },
          },
          {
            entityType: 'REPORT',
            entityId: {
              in: reportIds,
            },
          },
        ],
      };
    }

    const taskRows = await this.prisma.task.findMany({
      where: {
        assignments: {
          some: {
            memberId: viewer.userId,
            unassignedAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });
    const taskIds = taskRows.map((row) => row.id);

    return {
      OR: [
        {
          actorId: viewer.userId,
        },
        {
          entityType: 'USER',
          entityId: viewer.userId,
        },
        {
          entityType: 'TASK',
          entityId: {
            in: taskIds,
          },
        },
      ],
    };
  }

  private buildFilterWhere(
    viewer: OperixViewer,
    query: ListActivityQueryDto,
  ): Prisma.ActivityLogWhereInput[] {
    const filters: Prisma.ActivityLogWhereInput[] = [];

    if (query.action) {
      filters.push({
        action: query.action,
      });
    }

    if (query.entityType) {
      filters.push({
        entityType: query.entityType,
      });
    }

    if (query.actorId) {
      if (viewer.role === UserRole.MEMBER) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          APP_ERROR_CODE.FORBIDDEN,
          'You do not have access to this query.',
        );
      }

      filters.push({
        actorId: query.actorId,
      });
    }

    const dateRange = parseActivityDateRange(query.from, query.to);

    if (dateRange) {
      filters.push({
        createdAt: dateRange,
      });
    }

    return filters;
  }
}

const TIMEZONE_AWARE_ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseActivityDateRange(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter<'ActivityLog'> | null {
  const range: Prisma.DateTimeFilter<'ActivityLog'> = {};

  if (from) {
    range.gte = parseTimezoneAwareIsoDate(from, 'from');
  }

  if (to) {
    range.lte = parseTimezoneAwareIsoDate(to, 'to');
  }

  if (
    range.gte instanceof Date &&
    range.lte instanceof Date &&
    range.gte.getTime() > range.lte.getTime()
  ) {
    throw validationError('from must be earlier than or equal to to');
  }

  return range.gte || range.lte ? range : null;
}

function parseTimezoneAwareIsoDate(value: string, field: string): Date {
  if (!TIMEZONE_AWARE_ISO_DATETIME.test(value)) {
    throw validationError(
      `${field} must be a timezone-aware ISO date-time ending in Z or ±HH:MM`,
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw validationError(`${field} must be a valid ISO date-time`);
  }

  return date;
}

function validationError(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    APP_ERROR_CODE.VALIDATION_ERROR,
    message,
  );
}
