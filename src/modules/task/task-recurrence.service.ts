import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskCompletionMode,
  TaskRecurrenceBlockedReason,
  TaskStatus,
  TaskScope,
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
  createRecurrenceAnchor,
  getNextFutureOccurrence,
  getNextOccurrence,
  getOccurrenceKey,
} from '../../shared/time/business-time.js';
import type { UpdateTaskRecurrenceDto } from './dto/update-task-recurrence.dto.js';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
} from './task.constant.js';
import type { SafeTaskResponse } from './task.interface.js';
import { mapTaskResponse } from './task.mapper.js';
import { shouldMaterializeNextOccurrence } from './task-recurrence.policy.js';
import { generateTaskReferenceCode } from './task-reference.js';
import { taskSelect } from './task.select.js';

const RECURRENCE_BATCH_SIZE = 50;

const recurrenceSelect = {
  id: true,
  publicId: true,
  frequency: true,
  scope: true,
  title: true,
  description: true,
  remarks: true,
  priority: true,
  anchorDueAt: true,
  anchorLocalDay: true,
  anchorLocalWeekday: true,
  anchorLocalTime: true,
  nextOccurrenceAt: true,
  reminderLeadMinutes: true,
  isActive: true,
  broadcastAll: true,
  distributionLeadMinutes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      publicId: true,
      name: true,
      role: true,
      employeeId: true,
      designation: true,
    },
  },
  defaultResponsibleUser: {
    select: {
      publicId: true,
      name: true,
      role: true,
      employeeId: true,
      designation: true,
    },
  },
  team: { select: { publicId: true, name: true } },
  category: { select: { publicId: true } },
} as const;

@Injectable()
export class TaskRecurrenceService {
  private readonly logger = new Logger(TaskRecurrenceService.name);
  private readonly businessTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    configService: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone = configService.get('app.businessTimezone', {
      infer: true,
    });
  }

  async getRecurrence(_viewer: OperixViewer, publicId: string) {
    const recurrence = await this.prisma.taskRecurrence.findUnique({
      where: { publicId },
      select: recurrenceSelect,
    });
    if (!recurrence) throw this.notFound();
    return this.mapRecurrence(recurrence);
  }

  async listOccurrences(
    _viewer: OperixViewer,
    publicId: string,
  ): Promise<SafeTaskResponse[]> {
    const recurrence = await this.prisma.taskRecurrence.findUnique({
      where: { publicId },
      select: {
        tasks: {
          select: taskSelect,
          orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!recurrence) throw this.notFound();
    const now = new Date();
    return recurrence.tasks.map((task) => mapTaskResponse(task, now));
  }

  async updateRecurrence(
    viewer: OperixViewer,
    publicId: string,
    dto: UpdateTaskRecurrenceDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const existing = await tx.taskRecurrence.findUnique({
        where: { publicId },
        select: {
          id: true,
          createdById: true,
          isActive: true,
          frequency: true,
          anchorDueAt: true,
          anchorLocalDay: true,
          anchorLocalWeekday: true,
          anchorLocalTime: true,
          nextOccurrenceAt: true,
          scope: true,
        },
      });
      if (!existing) throw this.notFound();
      if (
        viewer.role !== UserRole.SUPER_ADMIN &&
        existing.createdById !== viewer.userId
      ) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          APP_ERROR_CODE.FORBIDDEN,
          'Only the recurrence owner or a Super Admin may update it.',
        );
      }
      let responsibleUserId: string | undefined;
      if (dto.responsibleUserId) {
        const responsible = await tx.user.findFirst({
          where: {
            publicId: dto.responsibleUserId,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!responsible) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TASK_ERROR_CODE.RESPONSIBLE_USER_NOT_ELIGIBLE,
            'The selected user is not eligible for direct work.',
          );
        }
        responsibleUserId = responsible.id;
      }
      if (
        dto.distributionLeadMinutes !== undefined &&
        dto.distributionLeadMinutes !== null &&
        existing.scope !== TaskScope.GLOBAL
      ) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          TASK_ERROR_CODE.INVALID_TASK_DISTRIBUTION,
          'Only global recurrences may enable broadcast distribution.',
        );
      }
      const isResuming = existing.isActive === false && dto.isActive === true;
      const anchor = createRecurrenceAnchor(
        existing.anchorDueAt,
        this.businessTimezone,
        existing.frequency,
      );
      const nextOccurrenceAt = isResuming
        ? getNextFutureOccurrence(
            existing.nextOccurrenceAt,
            new Date(),
            this.businessTimezone,
            existing.frequency,
            anchor,
          )
        : undefined;
      const clearsBlockedState =
        responsibleUserId !== undefined ||
        isResuming ||
        dto.distributionLeadMinutes !== undefined;
      const updated = await tx.taskRecurrence.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(responsibleUserId
            ? { defaultResponsibleUserId: responsibleUserId }
            : {}),
          ...(dto.reminderLeadMinutes !== undefined
            ? { reminderLeadMinutes: dto.reminderLeadMinutes }
            : {}),
          ...(dto.distributionLeadMinutes !== undefined
            ? {
                broadcastAll: dto.distributionLeadMinutes !== null,
                distributionLeadMinutes: dto.distributionLeadMinutes,
              }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(nextOccurrenceAt ? { nextOccurrenceAt } : {}),
          ...(clearsBlockedState
            ? {
                lastBlockedOccurrenceKey: null,
                lastBlockedReason: null,
                lastBlockedNotifiedAt: null,
              }
            : {}),
        },
        select: recurrenceSelect,
      });
      const action = isResuming
        ? TASK_ACTIVITY.TASK_RECURRENCE_RESUMED
        : dto.isActive === false && existing.isActive
          ? TASK_ACTIVITY.TASK_RECURRENCE_PAUSED
          : TASK_ACTIVITY.TASK_RECURRENCE_UPDATED;
      await writeActivity(tx, {
        actorId: viewer.userId,
        action,
        entityType: 'TASK_RECURRENCE',
        entityId: existing.id,
      });
      return this.mapRecurrence(updated);
    });
  }

  async reconcileDueRecurrences(now: Date): Promise<{
    eligible: number;
    generated: number;
    blocked: number;
  }> {
    const ids = await this.prisma.taskRecurrence.findMany({
      where: { isActive: true, nextOccurrenceAt: { lte: now } },
      orderBy: [{ nextOccurrenceAt: 'asc' }, { id: 'asc' }],
      take: RECURRENCE_BATCH_SIZE,
      select: { id: true },
    });
    let generated = 0;
    let blocked = 0;
    for (const { id } of ids) {
      const result = await this.reconcileRecurrence(id, now);
      if (result === 'generated') generated += 1;
      if (result === 'blocked') blocked += 1;
    }
    return { eligible: ids.length, generated, blocked };
  }

  async reconcileRecurrence(
    recurrenceId: string,
    now: Date,
  ): Promise<'generated' | 'blocked' | 'noop'> {
    let mail: TaskAssignedEmailInput | null = null;
    try {
      const result = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const recurrence = await tx.taskRecurrence.findUnique({
            where: { id: recurrenceId },
            include: {
              defaultResponsibleUser: {
                select: { id: true, name: true, email: true, status: true },
              },
              createdBy: { select: { id: true, status: true } },
              team: { select: { id: true } },
              tasks: {
                orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
                take: 2,
                select: {
                  id: true,
                  dueAt: true,
                  status: true,
                  occurrenceKey: true,
                },
              },
            },
          });
          if (!recurrence?.isActive) return 'noop' as const;
          const mayMaterialize = shouldMaterializeNextOccurrence(
            recurrence.tasks,
            recurrence.nextOccurrenceAt,
            now,
          );
          if (!mayMaterialize) return 'noop' as const;

          const dueAt = recurrence.nextOccurrenceAt;
          const occurrenceKey = getOccurrenceKey(dueAt, this.businessTimezone);
          const existing = await tx.task.findUnique({
            where: {
              recurrenceId_occurrenceKey: { recurrenceId, occurrenceKey },
            },
            select: { id: true },
          });
          if (existing) return 'noop' as const;
          if (recurrence.scope === TaskScope.TEAM && recurrence.team === null) {
            await this.recordBlocked(
              tx,
              recurrence,
              occurrenceKey,
              TaskRecurrenceBlockedReason.TEAM_NOT_AVAILABLE,
            );
            return 'blocked' as const;
          }
          if (recurrence.defaultResponsibleUser.status !== UserStatus.ACTIVE) {
            await this.recordBlocked(
              tx,
              recurrence,
              occurrenceKey,
              TaskRecurrenceBlockedReason.RESPONSIBLE_NOT_ACTIVE,
            );
            return 'blocked' as const;
          }
          const anchor = createRecurrenceAnchor(
            recurrence.anchorDueAt,
            this.businessTimezone,
            recurrence.frequency,
          );
          const nextOccurrenceAt = getNextOccurrence(
            dueAt,
            this.businessTimezone,
            recurrence.frequency,
            anchor,
          );
          const task = await tx.task.create({
            data: {
              referenceCode: generateTaskReferenceCode(now),
              title: recurrence.title,
              description: recurrence.description,
              remarks: recurrence.remarks,
              priority: recurrence.priority,
              status: TaskStatus.ASSIGNED,
              dueAt,
              completionMode: TaskCompletionMode.DIRECT,
              scope: recurrence.scope,
              recurrenceId,
              occurrenceKey,
              teamId: recurrence.teamId,
              categoryId: recurrence.categoryId,
              createdById: recurrence.createdById,
              assignments: {
                create: {
                  responsibleUserId: recurrence.defaultResponsibleUserId,
                  assignedById: recurrence.createdById,
                },
              },
              reminder: {
                create: {
                  scheduledAt: new Date(
                    dueAt.getTime() - recurrence.reminderLeadMinutes * 60_000,
                  ),
                },
              },
              ...(recurrence.broadcastAll &&
              recurrence.distributionLeadMinutes !== null
                ? {
                    distribution: {
                      create: {
                        scheduledAt: new Date(
                          dueAt.getTime() -
                            recurrence.distributionLeadMinutes * 60_000,
                        ),
                      },
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              publicId: true,
              referenceCode: true,
              title: true,
              priority: true,
              dueAt: true,
            },
          });
          await tx.taskStatusHistory.createMany({
            data: [
              {
                taskId: task.id,
                fromStatus: null,
                toStatus: TaskStatus.PENDING,
                changedById: recurrence.createdById,
                notes: 'Recurring task occurrence created.',
              },
              {
                taskId: task.id,
                fromStatus: TaskStatus.PENDING,
                toStatus: TaskStatus.ASSIGNED,
                changedById: recurrence.createdById,
                notes: 'Recurring task occurrence assigned.',
              },
            ],
          });
          await writeActivity(tx, {
            actorId: null,
            action: TASK_ACTIVITY.TASK_OCCURRENCE_GENERATED,
            entityType: 'TASK',
            entityId: task.id,
            metadata: { occurrenceKey },
          });
          if (
            recurrence.broadcastAll &&
            recurrence.distributionLeadMinutes !== null
          ) {
            await writeActivity(tx, {
              actorId: null,
              action: TASK_ACTIVITY.TASK_DISTRIBUTION_SCHEDULED,
              entityType: 'TASK',
              entityId: task.id,
            });
          }
          await createNotification(tx, {
            receiverId: recurrence.defaultResponsibleUserId,
            actorId: null,
            type: TASK_NOTIFICATION.TASK_ASSIGNED,
            title: 'Recurring task assigned',
            body: 'A recurring task occurrence has been assigned to you.',
            targetType: 'TASK',
            targetId: task.id,
          });
          await tx.taskRecurrence.update({
            where: { id: recurrenceId },
            data: {
              nextOccurrenceAt,
              lastBlockedOccurrenceKey: null,
              lastBlockedReason: null,
              lastBlockedNotifiedAt: null,
            },
          });
          mail = {
            responsibleUserId: recurrence.defaultResponsibleUser.id,
            responsibleName: recurrence.defaultResponsibleUser.name,
            responsibleEmail: recurrence.defaultResponsibleUser.email,
            taskId: task.publicId,
            referenceCode: task.referenceCode,
            title: task.title,
            priority: task.priority,
            dueAt: task.dueAt,
            assignmentNote: null,
          };
          return 'generated' as const;
        },
      );
      if (mail) {
        await this.mailService
          .sendTaskAssignedEmail(mail)
          .catch((error: unknown) => {
            this.logger.warn('Recurring task assignment email failed.', {
              eventId: recurrenceId,
              errorName: getErrorName(error),
            });
          });
      }
      return result;
    } catch (error) {
      if (isOccurrenceUniqueConflict(error)) return 'noop';
      throw error;
    }
  }

  private async recordBlocked(
    tx: PrismaTransactionClient,
    recurrence: {
      id: string;
      createdById: string;
      createdBy: { id: string; status: UserStatus };
      lastBlockedOccurrenceKey: string | null;
      lastBlockedReason: TaskRecurrenceBlockedReason | null;
    },
    occurrenceKey: string,
    reason: TaskRecurrenceBlockedReason,
  ): Promise<void> {
    if (
      recurrence.lastBlockedOccurrenceKey === occurrenceKey &&
      recurrence.lastBlockedReason === reason
    ) {
      return;
    }
    await writeActivity(tx, {
      actorId: null,
      action: TASK_ACTIVITY.TASK_RECURRENCE_BLOCKED,
      entityType: 'TASK_RECURRENCE',
      entityId: recurrence.id,
      metadata: { reason },
    });
    let receivers: string[] = [];
    if (recurrence.createdBy.status === UserStatus.ACTIVE) {
      receivers = [recurrence.createdById];
    } else {
      const superAdmins = await tx.user.findMany({
        where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      receivers = [...new Set(superAdmins.map(({ id }) => id))];
    }
    for (const receiverId of receivers) {
      await createNotification(tx, {
        receiverId,
        actorId: null,
        type: TASK_NOTIFICATION.TASK_RECURRENCE_BLOCKED,
        title: 'Recurring task generation blocked',
        body: 'A recurring task needs configuration attention.',
        targetType: 'TASK_RECURRENCE',
        targetId: recurrence.id,
      });
    }
    await tx.taskRecurrence.update({
      where: { id: recurrence.id },
      data: {
        lastBlockedOccurrenceKey: occurrenceKey,
        lastBlockedReason: reason,
        lastBlockedNotifiedAt: new Date(),
      },
    });
  }

  private mapRecurrence(
    recurrence: Prisma.TaskRecurrenceGetPayload<{
      select: typeof recurrenceSelect;
    }>,
  ) {
    return {
      id: recurrence.publicId,
      frequency: recurrence.frequency,
      title: recurrence.title,
      description: recurrence.description,
      remarks: recurrence.remarks,
      priority: recurrence.priority,
      owner: {
        id: recurrence.createdBy.publicId,
        name: recurrence.createdBy.name,
        role: recurrence.createdBy.role,
        employeeId: recurrence.createdBy.employeeId,
        designation: recurrence.createdBy.designation,
      },
      responsible: {
        id: recurrence.defaultResponsibleUser.publicId,
        name: recurrence.defaultResponsibleUser.name,
        role: recurrence.defaultResponsibleUser.role,
        employeeId: recurrence.defaultResponsibleUser.employeeId,
        designation: recurrence.defaultResponsibleUser.designation,
      },
      team: recurrence.team
        ? { id: recurrence.team.publicId, name: recurrence.team.name }
        : null,
      scope: recurrence.scope,
      categoryId: recurrence.category?.publicId ?? null,
      anchorDueAt: recurrence.anchorDueAt,
      nextOccurrenceAt: recurrence.nextOccurrenceAt,
      reminderLeadMinutes: recurrence.reminderLeadMinutes,
      distributionLeadMinutes: recurrence.distributionLeadMinutes,
      isActive: recurrence.isActive,
      createdAt: recurrence.createdAt,
      updatedAt: recurrence.updatedAt,
    };
  }

  private notFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_RECURRENCE_NOT_FOUND,
      'Task recurrence not found.',
    );
  }
}

function isOccurrenceUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
