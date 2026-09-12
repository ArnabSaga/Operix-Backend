import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskReminderStatus,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MailService } from '../../shared/mail/mail.service.js';
import type { TaskAssignedEmailInput } from '../../shared/mail/mail.interface.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../shared/pagination/pagination.interface.js';
import {
  createRecurrenceAnchor,
  getNextOccurrence,
  getOccurrenceKey,
} from '../../shared/time/business-time.js';
import type { AssignTaskDto } from './dto/assign-task.dto.js';
import type { CompleteTaskDto } from './dto/complete-task.dto.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
} from './task.constant.js';
import type {
  PaginatedTaskResponse,
  PaginatedTaskStatusHistoryResponse,
  SafeTaskResponse,
} from './task.interface.js';
import { mapTaskResponse } from './task.mapper.js';
import { buildTaskListWhere, getTaskOrderBy } from './task-query.js';
import { generateTaskReferenceCode } from './task-reference.js';
import { TaskRecurrenceService } from './task-recurrence.service.js';
import { TaskDistributionService } from './task-distribution.service.js';
import { taskSelect } from './task.select.js';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  private readonly businessTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly recurrenceService?: TaskRecurrenceService,
    private readonly distributionService?: TaskDistributionService,
    configService?: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone =
      configService?.get('app.businessTimezone', { infer: true }) ??
      'Asia/Dhaka';
  }

  async createTask(
    viewer: OperixViewer,
    dto: CreateTaskDto,
  ): Promise<SafeTaskResponse> {
    this.assertCreationRole(viewer);
    const now = new Date();
    const scope = dto.scope ?? TaskScope.TEAM;
    const completionMode = this.resolveCompletionMode(dto);
    this.validateScopeInput(viewer, dto, scope, completionMode);
    this.validateDistributionInput(dto, scope);
    this.validateRecurrenceInput(dto, completionMode, now);
    this.validateSelfClaimInput(dto);

    const result = await runSerializableTransaction(this.prisma, async (tx) => {
      const teamId =
        scope === TaskScope.TEAM
          ? await this.resolveCreationTeamId(tx, viewer, dto.teamId!)
          : null;
      const categoryId = await this.resolveCategoryId(tx, dto.categoryId);
      const responsible = dto.responsibleUserId
        ? await this.resolveResponsibleUser(
            tx,
            dto.responsibleUserId,
            completionMode,
          )
        : null;

      let recurrenceId: string | null = null;
      let occurrenceKey: string | null = null;
      if (dto.recurrence && dto.dueAt && responsible) {
        const anchor = createRecurrenceAnchor(
          dto.dueAt,
          this.businessTimezone,
          dto.recurrence.frequency,
        );
        const nextOccurrenceAt = getNextOccurrence(
          dto.dueAt,
          this.businessTimezone,
          dto.recurrence.frequency,
          anchor,
        );
        const recurrence = await tx.taskRecurrence.create({
          data: {
            frequency: dto.recurrence.frequency,
            scope,
            createdById: viewer.userId,
            defaultResponsibleUserId: responsible.id,
            teamId,
            categoryId,
            title: dto.title,
            description: dto.description ?? null,
            remarks: dto.remarks ?? null,
            priority: dto.priority ?? TaskPriority.MEDIUM,
            anchorDueAt: dto.dueAt,
            anchorLocalDay: anchor.anchorLocalDay,
            anchorLocalWeekday: anchor.anchorLocalWeekday,
            anchorLocalTime: anchor.anchorLocalTime,
            nextOccurrenceAt,
            reminderLeadMinutes: dto.recurrence.reminderLeadMinutes ?? 1_440,
            broadcastAll: dto.distribution !== undefined,
            distributionLeadMinutes: dto.distribution?.leadMinutes ?? null,
          },
          select: { id: true },
        });
        recurrenceId = recurrence.id;
        occurrenceKey = getOccurrenceKey(dto.dueAt, this.businessTimezone);
      }

      const initialStatus = responsible
        ? TaskStatus.ASSIGNED
        : TaskStatus.PENDING;
      const task = await tx.task.create({
        data: {
          referenceCode: generateTaskReferenceCode(now),
          title: dto.title,
          description: dto.description ?? null,
          remarks: dto.remarks ?? null,
          priority: dto.priority ?? TaskPriority.MEDIUM,
          status: initialStatus,
          scope,
          dueAt: dto.dueAt ?? null,
          completionMode,
          allowSelfClaim: dto.allowSelfClaim ?? false,
          recurrenceId,
          occurrenceKey,
          teamId,
          categoryId,
          createdById: viewer.userId,
        },
        select: taskSelect,
      });

      if (responsible) {
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            responsibleUserId: responsible.id,
            assignedById: viewer.userId,
            note: null,
          },
        });
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TASK_ACTIVITY.TASK_RESPONSIBILITY_ASSIGNED,
          entityType: 'TASK',
          entityId: task.id,
        });
      }

      await this.writeCreationHistory(
        tx,
        task.id,
        viewer.userId,
        initialStatus,
      );
      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_CREATED,
        entityType: 'TASK',
        entityId: task.id,
        metadata: { referenceCode: task.referenceCode },
      });

      if (recurrenceId && dto.dueAt) {
        await tx.taskReminder.create({
          data: {
            taskId: task.id,
            scheduledAt: new Date(
              dto.dueAt.getTime() -
                (dto.recurrence?.reminderLeadMinutes ?? 1_440) * 60_000,
            ),
          },
        });
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TASK_ACTIVITY.TASK_RECURRENCE_CREATED,
          entityType: 'TASK_RECURRENCE',
          entityId: recurrenceId,
        });
      }

      let distributionId: string | null = null;
      let distributionScheduledAt: Date | null = null;
      if (dto.distribution) {
        const scheduledAt = dto.recurrence
          ? new Date(
              dto.dueAt!.getTime() - dto.distribution.leadMinutes! * 60_000,
            )
          : (dto.distribution.scheduledAt ?? now);
        distributionScheduledAt = scheduledAt;
        const distribution = await tx.taskDistribution.create({
          data: { taskId: task.id, scheduledAt },
          select: { id: true },
        });
        distributionId = distribution.id;
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TASK_ACTIVITY.TASK_DISTRIBUTION_SCHEDULED,
          entityType: 'TASK',
          entityId: task.id,
        });
      }

      const mail = responsible
        ? await this.createAssignmentSideEffects(
            tx,
            task,
            responsible,
            viewer.userId,
            null,
          )
        : null;

      const selected =
        responsible || distributionId
          ? await tx.task.findFirst({
              where: { id: task.id },
              select: taskSelect,
            })
          : task;
      if (!selected) throw this.taskNotFound();
      return {
        task: mapTaskResponse(selected, now),
        mail,
        immediateDistributionId:
          distributionId && distributionScheduledAt! <= now
            ? distributionId
            : null,
      };
    });

    await this.sendAssignmentBestEffort(result.mail);
    if (result.immediateDistributionId) {
      await this.distributionService
        ?.processDistribution(result.immediateDistributionId, new Date())
        .catch((error: unknown) => {
          this.logger.warn('Immediate task distribution failed.', {
            eventId: result.task.id,
            errorName: getErrorName(error),
          });
        });
    }
    return result.task;
  }

  async listTasks(
    viewer: OperixViewer,
    query: ListTaskQueryDto,
  ): Promise<PaginatedTaskResponse> {
    this.validateListFilters(query);
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
      meta: createPaginationMeta({ ...normalized, total }),
    };
  }

  async getTasksForExport(
    viewer: OperixViewer,
    query: ListTaskQueryDto,
    now: Date,
    take: number,
  ): Promise<SafeTaskResponse[]> {
    this.validateListFilters(query);
    const tasks = await this.prisma.task.findMany({
      where: buildTaskListWhere(viewer, query, now),
      select: taskSelect,
      orderBy: getTaskOrderBy(query.sort),
      take,
    });
    return tasks.map((task) => mapTaskResponse(task, now));
  }

  async getTask(
    _viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeTaskResponse> {
    const task = await this.prisma.task.findFirst({
      where: { publicId: taskId },
      select: taskSelect,
    });
    if (!task) throw this.taskNotFound();
    return mapTaskResponse(task, new Date());
  }

  async getTaskHistory(
    _viewer: OperixViewer,
    taskId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedTaskStatusHistoryResponse> {
    const task = await this.prisma.task.findFirst({
      where: { publicId: taskId },
      select: { id: true, publicId: true },
    });
    if (!task) throw this.taskNotFound();
    const normalized = normalizePagination(pagination);
    const [data, total] = await Promise.all([
      this.prisma.taskStatusHistory.findMany({
        where: { taskId: task.id },
        select: {
          fromStatus: true,
          toStatus: true,
          changedBy: { select: { publicId: true, name: true } },
          notes: true,
          changedAt: true,
        },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.taskStatusHistory.count({ where: { taskId: task.id } }),
    ]);
    return {
      data: data.map((entry) => ({
        taskId: task.publicId,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedBy: { id: entry.changedBy.publicId, name: entry.changedBy.name },
        notes: entry.notes,
        changedAt: entry.changedAt,
      })),
      meta: createPaginationMeta({ ...normalized, total }),
    };
  }

  async assignTask(
    viewer: OperixViewer,
    taskId: string,
    dto: AssignTaskDto,
  ): Promise<SafeTaskResponse> {
    let result: { task: SafeTaskResponse; mail: TaskAssignedEmailInput };
    try {
      result = await runSerializableTransaction(this.prisma, async (tx) => {
        const task = await tx.task.findFirst({
          where: { publicId: taskId },
          select: {
            id: true,
            publicId: true,
            referenceCode: true,
            title: true,
            priority: true,
            dueAt: true,
            status: true,
            createdById: true,
            completionMode: true,
          },
        });
        if (!task) throw this.taskNotFound();
        if (
          viewer.role !== UserRole.SUPER_ADMIN &&
          task.createdById !== viewer.userId
        ) {
          throw this.forbidden();
        }
        if (
          task.status !== TaskStatus.PENDING &&
          task.status !== TaskStatus.ASSIGNED
        ) {
          throw this.transitionConflict('Task responsibility is locked.');
        }
        const responsible = await this.resolveResponsibleUser(
          tx,
          dto.responsibleUserId,
          task.completionMode,
        );
        const current = await this.findCurrentAssignment(tx, task.id);
        if (current?.responsibleUserId === responsible.id) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TASK_ERROR_CODE.TASK_ALREADY_ASSIGNED,
            'This user is already responsible for the task.',
          );
        }
        if (current) {
          await tx.taskAssignment.update({
            where: { id: current.id },
            data: { unassignedAt: new Date() },
          });
        }
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            responsibleUserId: responsible.id,
            assignedById: viewer.userId,
            note: normalizeOptionalText(dto.note),
          },
        });
        if (task.status === TaskStatus.PENDING) {
          await tx.taskStatusHistory.create({
            data: {
              taskId: task.id,
              fromStatus: TaskStatus.PENDING,
              toStatus: TaskStatus.ASSIGNED,
              changedById: viewer.userId,
              notes: 'Task assigned.',
            },
          });
        }
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: current
            ? TASK_ACTIVITY.TASK_RESPONSIBILITY_CHANGED
            : TASK_ACTIVITY.TASK_RESPONSIBILITY_ASSIGNED,
          entityType: 'TASK',
          entityId: task.id,
        });
        const mail = await this.createAssignmentSideEffects(
          tx,
          task,
          responsible,
          viewer.userId,
          normalizeOptionalText(dto.note),
        );
        const updated = await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.ASSIGNED },
          select: taskSelect,
        });
        return { task: mapTaskResponse(updated, new Date()), mail };
      });
    } catch (error) {
      throw mapAssignmentConflict(error);
    }
    await this.sendAssignmentBestEffort(result.mail);
    return result.task;
  }

  async updateSelfClaim(
    viewer: OperixViewer,
    taskId: string,
    enabled: boolean,
  ): Promise<SafeTaskResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findFirst({
        where: { publicId: taskId },
        select: {
          id: true,
          status: true,
          createdById: true,
          recurrenceId: true,
          allowSelfClaim: true,
        },
      });
      if (!task) throw this.taskNotFound();
      if (
        viewer.role !== UserRole.SUPER_ADMIN &&
        task.createdById !== viewer.userId
      ) {
        throw this.forbidden();
      }
      if (task.recurrenceId) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_SELF_CLAIM_NOT_ALLOWED_FOR_RECURRING_TASK,
          'Self claim is not available for recurring tasks.',
        );
      }
      if (task.status !== TaskStatus.PENDING) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_INVALID_STATUS_TRANSITION,
          'Self claim settings can only be changed for a pending task.',
        );
      }
      if (await this.findCurrentAssignment(tx, task.id)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_CLAIM_CONFLICT,
          'The task is no longer available for self claim.',
        );
      }

      if (task.allowSelfClaim === enabled) {
        const unchanged = await tx.task.findUnique({
          where: { id: task.id },
          select: taskSelect,
        });
        if (!unchanged) throw this.taskNotFound();
        return mapTaskResponse(unchanged, new Date());
      }

      const updated = await tx.task.update({
        where: { id: task.id },
        data: { allowSelfClaim: enabled },
        select: taskSelect,
      });
      await writeActivity(tx, {
        actorId: viewer.userId,
        action: enabled
          ? TASK_ACTIVITY.TASK_SELF_CLAIM_ENABLED
          : TASK_ACTIVITY.TASK_SELF_CLAIM_DISABLED,
        entityType: 'TASK',
        entityId: task.id,
      });
      return mapTaskResponse(updated, new Date());
    });
  }

  async claimTask(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeTaskResponse> {
    if (
      viewer.role !== UserRole.MEMBER ||
      viewer.status !== UserStatus.ACTIVE
    ) {
      throw this.forbidden();
    }

    let result: { task: SafeTaskResponse; mail: TaskAssignedEmailInput };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const claimedAt = new Date();
          const task = await tx.task.findFirst({
            where: { publicId: taskId },
            select: {
              id: true,
              publicId: true,
              referenceCode: true,
              title: true,
              priority: true,
              dueAt: true,
              status: true,
              allowSelfClaim: true,
              recurrenceId: true,
              createdById: true,
            },
          });
          if (!task) throw this.taskNotFound();
          if (task.recurrenceId) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.TASK_SELF_CLAIM_NOT_ALLOWED_FOR_RECURRING_TASK,
              'Self claim is not available for recurring tasks.',
            );
          }
          if (task.status !== TaskStatus.PENDING) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.TASK_INVALID_STATUS_TRANSITION,
              'Only a pending task may be claimed.',
            );
          }
          if (!task.allowSelfClaim) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.TASK_SELF_CLAIM_DISABLED,
              'Self claim is not enabled for this task.',
            );
          }
          if (await this.findCurrentAssignment(tx, task.id)) {
            throw this.claimConflict();
          }

          const claimant = await tx.user.findFirst({
            where: {
              id: viewer.userId,
              role: UserRole.MEMBER,
              status: UserStatus.ACTIVE,
            },
            select: { id: true, name: true, email: true },
          });
          if (!claimant) throw this.forbidden();

          await tx.taskAssignment.create({
            data: {
              taskId: task.id,
              responsibleUserId: claimant.id,
              assignedById: claimant.id,
              assignedAt: claimedAt,
              note: null,
            },
          });
          const transitioned = await tx.task.updateMany({
            where: { id: task.id, status: TaskStatus.PENDING },
            data: { status: TaskStatus.ASSIGNED },
          });
          if (transitioned.count !== 1) throw this.claimConflict();

          await tx.taskStatusHistory.create({
            data: {
              taskId: task.id,
              fromStatus: TaskStatus.PENDING,
              toStatus: TaskStatus.ASSIGNED,
              changedById: claimant.id,
              changedAt: claimedAt,
              notes: 'Task claimed.',
            },
          });
          await writeActivity(tx, {
            actorId: claimant.id,
            action: TASK_ACTIVITY.TASK_CLAIMED,
            entityType: 'TASK',
            entityId: task.id,
          });

          const mail = await this.createAssignmentSideEffects(
            tx,
            task,
            claimant,
            claimant.id,
            null,
          );
          if (task.createdById !== claimant.id) {
            await createNotification(tx, {
              receiverId: task.createdById,
              actorId: claimant.id,
              type: TASK_NOTIFICATION.TASK_CLAIMED,
              title: 'Task claimed',
              body: `"${task.title}" was claimed by a Member.`,
              targetType: 'TASK',
              targetId: task.id,
            });
          }

          const updated = await tx.task.findUnique({
            where: { id: task.id },
            select: taskSelect,
          });
          if (!updated) throw this.taskNotFound();
          return { task: mapTaskResponse(updated, claimedAt), mail };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw mapClaimConflict(error);
    }

    await this.sendAssignmentBestEffort(result.mail);
    return result.task;
  }

  async startTask(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeTaskResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findFirst({
        where: { publicId: taskId },
        select: { id: true, status: true },
      });
      if (!task) throw this.taskNotFound();
      const assignment = await this.findCurrentAssignment(tx, task.id);
      if (assignment?.responsibleUserId !== viewer.userId) {
        throw this.notResponsible();
      }
      if (task.status !== TaskStatus.ASSIGNED) {
        throw this.transitionConflict(
          'Task is not startable in its current status.',
        );
      }
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.IN_PROGRESS, startedAt: new Date() },
        select: taskSelect,
      });
      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
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
        entityId: task.id,
      });
      return mapTaskResponse(updated, new Date());
    });
  }

  async completeTask(
    viewer: OperixViewer,
    taskId: string,
    dto: CompleteTaskDto,
  ): Promise<SafeTaskResponse> {
    const result = await runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findFirst({
        where: { publicId: taskId },
        select: {
          id: true,
          status: true,
          completionMode: true,
          recurrenceId: true,
        },
      });
      if (!task) throw this.taskNotFound();
      const assignment = await this.findCurrentAssignment(tx, task.id);
      if (assignment?.responsibleUserId !== viewer.userId) {
        throw this.notResponsible();
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_ALREADY_COMPLETED,
          'Task is already completed.',
        );
      }
      if (task.completionMode !== TaskCompletionMode.DIRECT) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_DIRECT_COMPLETION_NOT_ALLOWED,
          'This task requires the submission and review workflow.',
        );
      }
      if (task.status !== TaskStatus.IN_PROGRESS) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_INVALID_STATUS_TRANSITION,
          'Task is not completable in its current status.',
        );
      }
      const completedAt = new Date();
      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt,
          completionNote: normalizeOptionalText(dto.completionNote),
        },
        select: taskSelect,
      });
      await tx.taskReminder.updateMany({
        where: { taskId: task.id, status: TaskReminderStatus.PENDING },
        data: { status: TaskReminderStatus.CANCELLED },
      });
      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: TaskStatus.IN_PROGRESS,
          toStatus: TaskStatus.COMPLETED,
          changedById: viewer.userId,
          notes: 'Task completed directly.',
        },
      });
      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_COMPLETED_DIRECT,
        entityType: 'TASK',
        entityId: task.id,
      });
      return {
        task: mapTaskResponse(updated, completedAt),
        recurrenceId: task.recurrenceId,
      };
    });
    if (result.recurrenceId) {
      await this.recurrenceService
        ?.reconcileRecurrence(result.recurrenceId, new Date())
        .catch((error: unknown) => {
          this.logger.warn('Task recurrence reconciliation failed.', {
            eventId: taskId,
            errorName: getErrorName(error),
          });
        });
    }
    return result.task;
  }

  private resolveCompletionMode(dto: CreateTaskDto): TaskCompletionMode {
    if (dto.scope === TaskScope.GLOBAL) {
      if (dto.completionMode === TaskCompletionMode.REVIEW_REQUIRED) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          TASK_ERROR_CODE.INVALID_TASK_SCOPE,
          'Global tasks must use direct completion.',
        );
      }
      return TaskCompletionMode.DIRECT;
    }
    if (dto.recurrence) {
      if (dto.completionMode === TaskCompletionMode.REVIEW_REQUIRED) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          TASK_ERROR_CODE.INVALID_TASK_RECURRENCE,
          'Recurring tasks must use direct completion.',
        );
      }
      return TaskCompletionMode.DIRECT;
    }
    return dto.completionMode ?? TaskCompletionMode.REVIEW_REQUIRED;
  }

  private validateScopeInput(
    viewer: OperixViewer,
    dto: CreateTaskDto,
    scope: TaskScope,
    completionMode: TaskCompletionMode,
  ): void {
    const invalidTeam = scope === TaskScope.TEAM && !dto.teamId;
    const invalidGlobal = scope === TaskScope.GLOBAL && dto.teamId != null;
    const unauthorizedGlobal =
      scope === TaskScope.GLOBAL && viewer.role !== UserRole.SUPER_ADMIN;
    if (
      invalidTeam ||
      invalidGlobal ||
      unauthorizedGlobal ||
      (scope === TaskScope.GLOBAL &&
        completionMode !== TaskCompletionMode.DIRECT)
    ) {
      throw new AppException(
        unauthorizedGlobal ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST,
        unauthorizedGlobal
          ? APP_ERROR_CODE.FORBIDDEN
          : TASK_ERROR_CODE.INVALID_TASK_SCOPE,
        unauthorizedGlobal
          ? 'Only a Super Admin may create a global task.'
          : 'Task scope and Team selection are invalid.',
      );
    }
  }

  private validateDistributionInput(
    dto: CreateTaskDto,
    scope: TaskScope,
  ): void {
    if (!dto.distribution) return;
    const invalidScope = scope !== TaskScope.GLOBAL;
    const recurring = dto.recurrence !== undefined;
    const invalidRecurring =
      recurring &&
      (dto.distribution.leadMinutes === undefined ||
        dto.distribution.scheduledAt !== undefined);
    const invalidOneTime =
      !recurring && dto.distribution.leadMinutes !== undefined;
    if (invalidScope || invalidRecurring || invalidOneTime) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        TASK_ERROR_CODE.INVALID_TASK_DISTRIBUTION,
        'Task distribution timing is invalid.',
      );
    }
  }

  private validateListFilters(query: ListTaskQueryDto): void {
    if (query.scope === TaskScope.GLOBAL && query.teamId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.VALIDATION_ERROR,
        'A global Task filter cannot include a Team.',
      );
    }
  }

  private validateRecurrenceInput(
    dto: CreateTaskDto,
    completionMode: TaskCompletionMode,
    now: Date,
  ): void {
    if (!dto.recurrence) return;
    if (
      !dto.dueAt ||
      dto.dueAt <= now ||
      !dto.responsibleUserId ||
      completionMode !== TaskCompletionMode.DIRECT
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        TASK_ERROR_CODE.INVALID_TASK_RECURRENCE,
        'Recurrence requires a future due date, a responsible user, and direct completion.',
      );
    }
  }

  private validateSelfClaimInput(dto: CreateTaskDto): void {
    if (
      dto.allowSelfClaim === true &&
      (dto.responsibleUserId !== undefined || dto.recurrence !== undefined)
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.VALIDATION_ERROR,
        'Self claim requires a non recurring task without a responsible user.',
      );
    }
  }

  private async resolveCreationTeamId(
    tx: PrismaTransactionClient,
    viewer: OperixViewer,
    teamPublicId: string,
  ): Promise<string> {
    const team = await tx.team.findFirst({
      where: {
        publicId: teamPublicId,
        ...(viewer.role === UserRole.ADMIN ? { adminId: viewer.userId } : {}),
      },
      select: { id: true },
    });
    if (!team) throw this.taskNotFound();
    return team.id;
  }

  private async resolveCategoryId(
    tx: PrismaTransactionClient,
    categoryId?: string,
  ): Promise<string | null> {
    if (!categoryId) return null;
    const category = await tx.taskCategory.findUnique({
      where: { publicId: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
        'Task category does not exist.',
      );
    }
    return category.id;
  }

  private async resolveResponsibleUser(
    tx: PrismaTransactionClient,
    publicId: string,
    completionMode: TaskCompletionMode,
  ) {
    const user = await tx.user.findFirst({
      where: {
        publicId,
        status: UserStatus.ACTIVE,
        ...(completionMode === TaskCompletionMode.REVIEW_REQUIRED
          ? { role: UserRole.MEMBER }
          : {}),
      },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.RESPONSIBLE_USER_NOT_ELIGIBLE,
        'The selected user is not eligible for this task.',
      );
    }
    return user;
  }

  private async writeCreationHistory(
    tx: PrismaTransactionClient,
    taskId: string,
    actorId: string,
    finalStatus: TaskStatus,
  ): Promise<void> {
    await tx.taskStatusHistory.create({
      data: {
        taskId,
        fromStatus: null,
        toStatus: TaskStatus.PENDING,
        changedById: actorId,
        notes: 'Task created.',
      },
    });
    if (finalStatus === TaskStatus.ASSIGNED) {
      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromStatus: TaskStatus.PENDING,
          toStatus: TaskStatus.ASSIGNED,
          changedById: actorId,
          notes: 'Task assigned.',
        },
      });
    }
  }

  private async createAssignmentSideEffects(
    tx: PrismaTransactionClient,
    task: {
      id: string;
      publicId: string;
      referenceCode: string;
      title: string;
      priority: TaskPriority;
      dueAt: Date | null;
    },
    responsible: { id: string; name: string; email: string },
    actorId: string | null,
    assignmentNote: string | null,
  ): Promise<TaskAssignedEmailInput> {
    await createNotification(tx, {
      receiverId: responsible.id,
      actorId,
      type: TASK_NOTIFICATION.TASK_ASSIGNED,
      title: 'New task assigned',
      body: 'A new task has been assigned to you.',
      targetType: 'TASK',
      targetId: task.id,
    });
    return {
      responsibleUserId: responsible.id,
      responsibleName: responsible.name,
      responsibleEmail: responsible.email,
      taskId: task.publicId,
      referenceCode: task.referenceCode,
      title: task.title,
      priority: task.priority,
      dueAt: task.dueAt,
      assignmentNote,
    };
  }

  private async findCurrentAssignment(
    tx: PrismaTransactionClient,
    taskId: string,
  ) {
    return tx.taskAssignment.findFirst({
      where: { taskId, unassignedAt: null },
      select: { id: true, responsibleUserId: true },
    });
  }

  private async sendAssignmentBestEffort(
    mail: TaskAssignedEmailInput | null,
  ): Promise<void> {
    if (!mail) return;
    try {
      await this.mailService.sendTaskAssignedEmail(mail);
    } catch (error) {
      this.logger.warn('Task assignment email failed.', {
        eventId: mail.taskId,
        errorName: getErrorName(error),
      });
    }
  }

  private assertCreationRole(viewer: OperixViewer): void {
    if (
      viewer.role !== UserRole.SUPER_ADMIN &&
      viewer.role !== UserRole.ADMIN
    ) {
      throw this.forbidden();
    }
  }

  private notResponsible(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      TASK_ERROR_CODE.TASK_NOT_RESPONSIBLE,
      'Only the current responsible user may perform this action.',
    );
  }

  private forbidden(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this action.',
    );
  }

  private transitionConflict(message: string): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.INVALID_TASK_TRANSITION,
      message,
    );
  }

  private claimConflict(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.TASK_CLAIM_CONFLICT,
      'The task is no longer available for claiming.',
    );
  }

  private taskNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_NOT_FOUND,
      'Task not found.',
    );
  }
}

function mapAssignmentConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.TASK_ALREADY_ASSIGNED,
      'Task already has an active assignment.',
    );
  }
  return error instanceof Error ? error : new Error('Unexpected error.');
}

function mapClaimConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.TASK_CLAIM_CONFLICT,
      'The task is no longer available for claiming.',
    );
  }
  if (
    error instanceof AppException &&
    (error.getResponse() as { code?: string }).code ===
      APP_ERROR_CODE.CONCURRENT_MODIFICATION
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TASK_ERROR_CODE.TASK_CLAIM_CONFLICT,
      'The task is no longer available for claiming.',
    );
  }
  return error instanceof Error ? error : new Error('Unexpected error.');
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}
