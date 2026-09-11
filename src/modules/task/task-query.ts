import type { Prisma } from '../../../generated/prisma/client.js';
import { TaskStatus } from '../../../generated/prisma/enums.js';
import { TaskScope } from '../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import type { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import { TaskSort } from './task.constant.js';

export function buildTaskListWhere(
  viewer: OperixViewer,
  query: ListTaskQueryDto,
  now: Date,
): Prisma.TaskWhereInput {
  void viewer;

  return {
    AND: buildTaskFilterConditions(query, now),
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

function buildTaskFilterConditions(
  query: ListTaskQueryDto,
  now: Date,
): Prisma.TaskWhereInput[] {
  const conditions: Prisma.TaskWhereInput[] = [];

  if (query.scope) {
    conditions.push({ scope: query.scope });
  } else if (query.teamId) {
    conditions.push({ scope: TaskScope.TEAM });
  }

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

  if (query.responsibleUserId) {
    conditions.push({
      assignments: {
        some: {
          responsibleUser: { publicId: query.responsibleUserId },
          unassignedAt: null,
        },
      },
    });
  }

  if (query.ownerId) {
    conditions.push({ createdBy: { publicId: query.ownerId } });
  }

  if (query.recurrenceId) {
    conditions.push({ recurrence: { publicId: query.recurrenceId } });
  }

  if (query.recurrenceFrequency) {
    conditions.push({ recurrence: { frequency: query.recurrenceFrequency } });
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
