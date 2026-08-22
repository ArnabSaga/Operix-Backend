import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskPriority,
  TaskStatus,
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
import { MailService } from '../../shared/mail/mail.service.js';
import type { TaskAssignedEmailInput } from '../../shared/mail/mail.interface.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../shared/pagination/pagination.interface.js';
import type { AssignTaskDto } from './dto/assign-task.dto.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import { buildTaskScopeWhere } from './policies/task-scope.policy.js';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
} from './task.constant.js';
import type {
  PaginatedTaskStatusHistoryResponse,
  PaginatedTaskResponse,
  SafeTaskResponse,
} from './task.interface.js';
import { mapTaskResponse } from './task.mapper.js';
import { buildTaskListWhere, getTaskOrderBy } from './task-query.js';
import { taskSelect } from './task.select.js';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createTask(
    viewer: OperixViewer,
    dto: CreateTaskDto,
  ): Promise<SafeTaskResponse> {
    this.assertRole(viewer, UserRole.ADMIN);

    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertAdminOwnsTeam(tx, viewer.userId, dto.teamId);
      await this.assertCategoryExists(tx, dto.categoryId);

      const task = await tx.task.create({
        data: {
          referenceCode: generateTaskReferenceCode(),
          title: dto.title,
          description: dto.description ?? null,
          remarks: dto.remarks ?? null,
          priority: dto.priority ?? TaskPriority.MEDIUM,
          status: TaskStatus.PENDING,
          dueAt: dto.dueAt ?? null,
          teamId: dto.teamId,
          categoryId: dto.categoryId ?? null,
          createdById: viewer.userId,
        },
        select: taskSelect,
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: null,
          toStatus: TaskStatus.PENDING,
          changedById: viewer.userId,
          notes: 'Task created.',
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_CREATED,
        entityType: 'TASK',
        entityId: task.id,
        metadata: {
          taskId: task.id,
          referenceCode: task.referenceCode,
          teamId: task.teamId,
        },
      });

      return mapTaskResponse(task, new Date());
    });
  }

  async listTasks(
    viewer: OperixViewer,
    query: ListTaskQueryDto,
  ): Promise<PaginatedTaskResponse> {
    const normalized = normalizePagination(query);
    const now = new Date();
    const where = buildTaskListWhere(viewer, query, now);
    const orderBy = getTaskOrderBy(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: taskSelect,
        orderBy,
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: data.map((task) => mapTaskResponse(task, now)),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getTasksForExport(
    viewer: OperixViewer,
    query: ListTaskQueryDto,
    now: Date,
    take: number,
  ): Promise<SafeTaskResponse[]> {
    const where = buildTaskListWhere(viewer, query, now);
    const orderBy = getTaskOrderBy(query.sort);
    const tasks = await this.prisma.task.findMany({
      where,
      select: taskSelect,
      orderBy,
      take,
    });

    return tasks.map((task) => mapTaskResponse(task, now));
  }

  async getTask(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeTaskResponse> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...buildTaskScopeWhere(viewer),
      },
      select: taskSelect,
    });

    if (!task) {
      throw this.taskNotFound();
    }

    return mapTaskResponse(task, new Date());
  }

  async getTaskHistory(
    viewer: OperixViewer,
    taskId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedTaskStatusHistoryResponse> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        AND: [buildTaskScopeWhere(viewer)],
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw this.taskNotFound();
    }

    const normalized = normalizePagination(pagination);
    const where = {
      taskId,
    };

    const [data, total] = await Promise.all([
      this.prisma.taskStatusHistory.findMany({
        where,
        select: {
          id: true,
          taskId: true,
          fromStatus: true,
          toStatus: true,
          changedById: true,
          notes: true,
          changedAt: true,
        },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.taskStatusHistory.count({
        where,
      }),
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

  async assignTask(
    viewer: OperixViewer,
    taskId: string,
    dto: AssignTaskDto,
  ): Promise<SafeTaskResponse> {
    this.assertRole(viewer, UserRole.ADMIN);

    let assignmentResult: {
      task: SafeTaskResponse;
      mail: TaskAssignedEmailInput;
    };

    try {
      assignmentResult = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const task = await this.findAdminScopedTask(
            tx,
            viewer.userId,
            taskId,
          );

          if (task.status !== TaskStatus.PENDING) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.INVALID_TASK_TRANSITION,
              'Task is not assignable in its current status.',
            );
          }

          const currentAssignment = await this.findCurrentAssignment(
            tx,
            taskId,
          );

          if (currentAssignment) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.TASK_ALREADY_ASSIGNED,
              'Task already has an active assignment.',
            );
          }

          const member = await tx.user.findFirst({
            where: {
              id: dto.memberId,
              role: UserRole.MEMBER,
              status: UserStatus.ACTIVE,
              teamMembership: {
                teamId: task.teamId,
              },
            },
            select: {
              id: true,
              name: true,
              email: true,
            },
          });

          if (!member) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.MEMBER_NOT_ELIGIBLE_FOR_TASK,
              'Member is not eligible for this task.',
            );
          }

          await tx.taskAssignment.create({
            data: {
              taskId,
              memberId: dto.memberId,
              assignedById: viewer.userId,
              note: dto.note ?? null,
            },
          });

          const updated = await tx.task.update({
            where: {
              id: taskId,
            },
            data: {
              status: TaskStatus.ASSIGNED,
            },
            select: taskSelect,
          });

          await tx.taskStatusHistory.create({
            data: {
              taskId,
              fromStatus: TaskStatus.PENDING,
              toStatus: TaskStatus.ASSIGNED,
              changedById: viewer.userId,
              notes: 'Task assigned.',
            },
          });

          await writeActivity(tx, {
            actorId: viewer.userId,
            action: TASK_ACTIVITY.TASK_ASSIGNED,
            entityType: 'TASK',
            entityId: taskId,
            metadata: {
              taskId,
              memberId: dto.memberId,
            },
          });

          await createNotification(tx, {
            receiverId: dto.memberId,
            actorId: viewer.userId,
            type: TASK_NOTIFICATION.TASK_ASSIGNED,
            title: 'New task assigned',
            body: 'A new task has been assigned to you.',
            targetType: 'TASK',
            targetId: taskId,
          });

          return {
            task: mapTaskResponse(updated, new Date()),
            mail: {
              memberId: member.id,
              memberName: member.name,
              memberEmail: member.email,
              taskId: updated.id,
              referenceCode: updated.referenceCode,
              title: updated.title,
              priority: updated.priority,
              dueAt: updated.dueAt,
              assignmentNote: dto.note ?? null,
            },
          };
        },
      );
    } catch (error) {
      throw mapAssignmentConflict(error);
    }

    try {
      await this.mailService.sendTaskAssignedEmail(assignmentResult.mail);
    } catch (error) {
      this.logger.warn(
        `TASK_ASSIGNED email failed for task ${taskId}: ${getErrorMessage(error)}`,
      );
    }

    return assignmentResult.task;
  }

  async startTask(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeTaskResponse> {
    this.assertRole(viewer, UserRole.MEMBER);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          assignments: {
            some: {
              memberId: viewer.userId,
              unassignedAt: null,
            },
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!task) {
        throw this.taskNotFound();
      }

      if (task.status !== TaskStatus.ASSIGNED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.INVALID_TASK_TRANSITION,
          'Task is not startable in its current status.',
        );
      }

      const updated = await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: TaskStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
        select: taskSelect,
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromStatus: TaskStatus.ASSIGNED,
          toStatus: TaskStatus.IN_PROGRESS,
          changedById: viewer.userId,
          notes: 'Task started.',
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_STARTED,
        entityType: 'TASK',
        entityId: taskId,
        metadata: {
          taskId,
        },
      });

      return mapTaskResponse(updated, new Date());
    });
  }

  private async findAdminScopedTask(
    tx: PrismaTransactionClient,
    adminId: string,
    taskId: string,
  ) {
    const task = await tx.task.findFirst({
      where: {
        id: taskId,
        team: {
          adminId,
        },
      },
      select: {
        id: true,
        status: true,
        teamId: true,
      },
    });

    if (!task) {
      throw this.taskNotFound();
    }

    return task;
  }

  private async assertAdminOwnsTeam(
    tx: PrismaTransactionClient,
    adminId: string,
    teamId: string,
  ): Promise<void> {
    const team = await tx.team.findFirst({
      where: {
        id: teamId,
        adminId,
      },
      select: {
        id: true,
      },
    });

    if (!team) {
      throw this.taskNotFound();
    }
  }

  private async assertCategoryExists(
    tx: PrismaTransactionClient,
    categoryId?: string,
  ): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await tx.taskCategory.findUnique({
      where: {
        id: categoryId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
        'Task category does not exist.',
      );
    }
  }

  private async findCurrentAssignment(
    tx: PrismaTransactionClient,
    taskId: string,
  ) {
    return tx.taskAssignment.findFirst({
      where: {
        taskId,
        unassignedAt: null,
      },
      select: {
        id: true,
        memberId: true,
      },
    });
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

  private taskNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_NOT_FOUND,
      'Task not found.',
    );
  }
}

function generateTaskReferenceCode(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();

  return `TASK-${date}-${suffix}`;
}

function mapAssignmentConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.TASK_ALREADY_ASSIGNED,
      'Task already has an active assignment.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown SMTP error';
}
