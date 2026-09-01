import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { TaskStatus, UserRole } from '../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import type { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import { buildTaskScopeWhere } from './policies/task-scope.policy.js';
import { TaskSort } from './task.constant.js';

export function buildTaskListWhere(
  viewer: OperixViewer,
  query: ListTaskQueryDto,
  now: Date,
): Prisma.TaskWhereInput {
  assertAllowedTaskQuery(viewer, query);

  return {
    AND: [
      buildTaskScopeWhere(viewer),
      ...buildTaskFilterConditions(query, now),
    ],
  };
}

export function getTaskOrderBy(
  sort: TaskSort = TaskSort.CREATED_AT_DESC,
): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case TaskSort.CREATED_AT_ASC:
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case TaskSort.DUE_AT_ASC:
      return [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case TaskSort.DUE_AT_DESC:
      return [{ dueAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    case TaskSort.PRIORITY_ASC:
      return [{ priority: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }];
    case TaskSort.PRIORITY_DESC:
      return [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
    case TaskSort.CREATED_AT_DESC:
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

function assertAllowedTaskQuery(
  viewer: OperixViewer,
  query: ListTaskQueryDto,
): void {
  if (query.teamId && viewer.role !== UserRole.SUPER_ADMIN) {
    throw forbidden();
  }

  if (query.assignedMemberId && viewer.role === UserRole.MEMBER) {
    throw forbidden();
  }
}

function buildTaskFilterConditions(
  query: ListTaskQueryDto,
  now: Date,
): Prisma.TaskWhereInput[] {
  const conditions: Prisma.TaskWhereInput[] = [];

  if (query.status) {
    conditions.push({
      status: query.status,
    });
  }

  if (query.priority) {
    conditions.push({
      priority: query.priority,
    });
  }

  if (query.teamId) {
    conditions.push({
      team: { publicId: query.teamId },
    });
  }

  if (query.assignedMemberId) {
    conditions.push({
      assignments: {
        some: {
          member: { publicId: query.assignedMemberId },
          unassignedAt: null,
        },
      },
    });
  }

  if (query.overdue === true) {
    conditions.push({
      dueAt: {
        lt: now,
      },
      status: {
        notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
      },
    });
  }

  if (query.overdue === false) {
    conditions.push({
      OR: [
        {
          dueAt: null,
        },
        {
          dueAt: {
            gte: now,
          },
        },
        {
          status: {
            in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
          },
        },
      ],
    });
  }

  if (query.q) {
    conditions.push({
      OR: [
        {
          referenceCode: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          title: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
      ],
    });
  }

  return conditions;
}

function forbidden(): AppException {
  return new AppException(
    HttpStatus.FORBIDDEN,
    APP_ERROR_CODE.FORBIDDEN,
    'You do not have access to this resource.',
  );
}
