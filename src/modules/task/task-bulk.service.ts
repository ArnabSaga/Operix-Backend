import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskBatchScope,
  TaskCompletionMode,
  TaskPriority,
  TaskRecurrenceBlockedReason,
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
import type { TaskAssignedEmailInput } from '../../shared/mail/mail.interface.js';
import { MailService } from '../../shared/mail/mail.service.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createRecurrenceAnchor,
  getNextOccurrence,
  getOccurrenceKey,
} from '../../shared/time/business-time.js';
import type { CreateBulkTaskDto } from './dto/create-bulk-task.dto.js';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
} from './task.constant.js';
import type { BulkTaskResponse } from './task.interface.js';
import { generateTaskReferenceCode } from './task-reference.js';

const BULK_TASK_TRANSACTION_TIMEOUT_MS = 60_000;
const BULK_RECURRENCE_BATCH_SIZE = 25;

interface BulkRecipient {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  teamMembership: {
    team: {
      id: string;
      admin: { id: string; role: UserRole; status: UserStatus };
    };
  } | null;
}

interface BulkTemplate {
  createdById: string;
  scope: TaskBatchScope;
  teamId: string | null;
  categoryId: string | null;
  title: string;
  description: string | null;
  remarks: string | null;
  priority: TaskPriority;
  reminderLeadMinutes: number | null;
}

@Injectable()
export class TaskBulkService {
  private readonly logger = new Logger(TaskBulkService.name);
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

  async createBulkTask(
    viewer: OperixViewer,
    dto: CreateBulkTaskDto,
  ): Promise<BulkTaskResponse> {
    if (viewer.role !== UserRole.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this action.',
      );
    }
    if (dto.dueAt <= new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.VALIDATION_ERROR,
        'Bulk task due date must be in the future.',
      );
    }
    this.assertScope(dto.scope, dto.teamId);

    const result = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const teamId = await this.resolveTeamId(tx, dto.scope, dto.teamId);
        const recipients = await this.resolveRecipients(tx, dto.scope, teamId);
        this.assertRecipients(recipients);
        const categoryId = await this.resolveCategoryId(tx, dto.categoryId);
        const template: BulkTemplate = {
          createdById: viewer.userId,
          scope: dto.scope,
          teamId,
          categoryId,
          title: dto.title,
          description: dto.description ?? null,
          remarks: dto.remarks ?? null,
          priority: dto.priority ?? TaskPriority.MEDIUM,
          reminderLeadMinutes: dto.recurrence?.reminderLeadMinutes ?? null,
        };

        let recurrenceId: string | null = null;
        let occurrenceKey: string | null = null;
        if (dto.recurrence) {
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
          const recurrence = await tx.taskBatchRecurrence.create({
            data: {
              ...template,
              frequency: dto.recurrence.frequency,
              anchorDueAt: dto.dueAt,
              ...anchor,
              nextOccurrenceAt,
            },
            select: { id: true },
          });
          recurrenceId = recurrence.id;
          occurrenceKey = getOccurrenceKey(dto.dueAt, this.businessTimezone);
        }

        const materialized = await this.materializeBatch(tx, {
          template,
          dueAt: dto.dueAt,
          recipients,
          recurrenceId,
          occurrenceKey,
        });

        return {
          response: this.toResponse(materialized.batchPublicId, recipients),
          mails: materialized.mails,
        };
      },
      { timeoutMs: BULK_TASK_TRANSACTION_TIMEOUT_MS },
    );

    await this.sendAssignmentMails(result.mails);
    return result.response;
  }

  async reconcileDueRecurrences(now: Date): Promise<{
    eligible: number;
    generated: number;
    blocked: number;
  }> {
    const recurrences = await this.prisma.taskBatchRecurrence.findMany({
      where: { isActive: true, nextOccurrenceAt: { lte: now } },
      orderBy: [{ nextOccurrenceAt: 'asc' }, { id: 'asc' }],
      take: BULK_RECURRENCE_BATCH_SIZE,
      select: { id: true },
    });
    let generated = 0;
    let blocked = 0;
    for (const recurrence of recurrences) {
      const result = await this.reconcileRecurrence(recurrence.id, now);
      if (result === 'generated') generated += 1;
      if (result === 'blocked') blocked += 1;
    }
    return { eligible: recurrences.length, generated, blocked };
  }

  async reconcileRecurrence(
    recurrenceId: string,
    now: Date,
  ): Promise<'generated' | 'blocked' | 'noop'> {
    try {
      const result = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const recurrence = await tx.taskBatchRecurrence.findUnique({
            where: { id: recurrenceId },
            select: {
              id: true,
              createdById: true,
              scope: true,
              teamId: true,
              categoryId: true,
              title: true,
              description: true,
              remarks: true,
              priority: true,
              frequency: true,
              anchorLocalDay: true,
              anchorLocalWeekday: true,
              anchorLocalTime: true,
              nextOccurrenceAt: true,
              reminderLeadMinutes: true,
              isActive: true,
              lastBlockedOccurrenceKey: true,
              lastBlockedReason: true,
              createdBy: { select: { role: true, status: true } },
            },
          });
          if (!recurrence?.isActive || recurrence.nextOccurrenceAt > now) {
            return { state: 'noop' as const, mails: [] };
          }

          const dueAt = recurrence.nextOccurrenceAt;
          const occurrenceKey = getOccurrenceKey(dueAt, this.businessTimezone);
          const existing = await tx.taskBatch.findUnique({
            where: {
              recurrenceId_occurrenceKey: { recurrenceId, occurrenceKey },
            },
            select: { id: true },
          });
          if (existing) return { state: 'noop' as const, mails: [] };

          if (
            recurrence.createdBy.role !== UserRole.SUPER_ADMIN ||
            recurrence.createdBy.status !== UserStatus.ACTIVE
          ) {
            await this.recordBlocked(
              tx,
              recurrence,
              occurrenceKey,
              TaskRecurrenceBlockedReason.INVALID_SERIES_CONFIGURATION,
              now,
            );
            return { state: 'blocked' as const, mails: [] };
          }

          let recipients: BulkRecipient[];
          try {
            recipients = await this.resolveRecipients(
              tx,
              recurrence.scope,
              recurrence.teamId,
            );
            this.assertRecipients(recipients);
          } catch (error) {
            if (!(error instanceof AppException)) throw error;
            await this.recordBlocked(
              tx,
              recurrence,
              occurrenceKey,
              recurrence.scope === TaskBatchScope.TEAM
                ? TaskRecurrenceBlockedReason.TEAM_NOT_AVAILABLE
                : TaskRecurrenceBlockedReason.INVALID_SERIES_CONFIGURATION,
              now,
            );
            return { state: 'blocked' as const, mails: [] };
          }

          const anchor = {
            anchorLocalDay: recurrence.anchorLocalDay,
            anchorLocalWeekday: recurrence.anchorLocalWeekday,
            anchorLocalTime: recurrence.anchorLocalTime,
          };
          const nextOccurrenceAt = getNextOccurrence(
            dueAt,
            this.businessTimezone,
            recurrence.frequency,
            anchor,
          );
          const materialized = await this.materializeBatch(tx, {
            template: {
              createdById: recurrence.createdById,
              scope: recurrence.scope,
              teamId: recurrence.teamId,
              categoryId: recurrence.categoryId,
              title: recurrence.title,
              description: recurrence.description,
              remarks: recurrence.remarks,
              priority: recurrence.priority,
              reminderLeadMinutes: recurrence.reminderLeadMinutes,
            },
            dueAt,
            recipients,
            recurrenceId,
            occurrenceKey,
          });
          await tx.taskBatchRecurrence.update({
            where: { id: recurrence.id },
            data: {
              nextOccurrenceAt,
              lastBlockedOccurrenceKey: null,
              lastBlockedReason: null,
              lastBlockedNotifiedAt: null,
            },
            select: { id: true },
          });
          return { state: 'generated' as const, mails: materialized.mails };
        },
        { timeoutMs: BULK_TASK_TRANSACTION_TIMEOUT_MS },
      );

      if (result.mails.length > 0) await this.sendAssignmentMails(result.mails);
      return result.state;
    } catch (error) {
      if (isOccurrenceUniqueConflict(error)) return 'noop';
      throw error;
    }
  }

  private async materializeBatch(
    tx: PrismaTransactionClient,
    input: {
      template: BulkTemplate;
      dueAt: Date;
      recipients: BulkRecipient[];
      recurrenceId: string | null;
      occurrenceKey: string | null;
    },
  ): Promise<{ batchPublicId: string; mails: TaskAssignedEmailInput[] }> {
    const batch = await tx.taskBatch.create({
      data: {
        createdById: input.template.createdById,
        recipientCount: input.recipients.length,
        scope: input.template.scope,
        teamId: input.template.teamId,
        recurrenceId: input.recurrenceId,
        occurrenceKey: input.occurrenceKey,
      },
      select: { id: true, publicId: true },
    });
    const mails: TaskAssignedEmailInput[] = [];

    for (const recipient of input.recipients) {
      const memberTeam = recipient.teamMembership?.team ?? null;
      const reviewerUserId =
        recipient.role === UserRole.MEMBER
          ? memberTeam!.admin.id
          : input.template.createdById;
      const task = await tx.task.create({
        data: {
          referenceCode: generateTaskReferenceCode(),
          title: input.template.title,
          description: input.template.description,
          remarks: input.template.remarks,
          priority: input.template.priority,
          status: TaskStatus.ASSIGNED,
          scope: TaskScope.INDIVIDUAL,
          dueAt: input.dueAt,
          completionMode: TaskCompletionMode.REVIEW_REQUIRED,
          allowSelfClaim: false,
          teamId: recipient.role === UserRole.MEMBER ? memberTeam!.id : null,
          categoryId: input.template.categoryId,
          createdById: input.template.createdById,
          batchId: batch.id,
          reviewerUserId,
          ...(input.template.reminderLeadMinutes !== null
            ? {
                reminder: {
                  create: {
                    scheduledAt: new Date(
                      input.dueAt.getTime() -
                        input.template.reminderLeadMinutes * 60_000,
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
      await tx.taskAssignment.create({
        data: {
          taskId: task.id,
          responsibleUserId: recipient.id,
          assignedById: input.template.createdById,
        },
      });
      await tx.taskStatusHistory.createMany({
        data: [
          {
            taskId: task.id,
            fromStatus: null,
            toStatus: TaskStatus.PENDING,
            changedById: input.template.createdById,
            notes: 'Task created as part of a bulk assignment.',
          },
          {
            taskId: task.id,
            fromStatus: TaskStatus.PENDING,
            toStatus: TaskStatus.ASSIGNED,
            changedById: input.template.createdById,
            notes: 'Task assigned.',
          },
        ],
      });
      await writeActivity(tx, {
        actorId: input.template.createdById,
        action: TASK_ACTIVITY.TASK_CREATED,
        entityType: 'TASK',
        entityId: task.id,
        metadata: { referenceCode: task.referenceCode },
      });
      await writeActivity(tx, {
        actorId: input.template.createdById,
        action: TASK_ACTIVITY.TASK_RESPONSIBILITY_ASSIGNED,
        entityType: 'TASK',
        entityId: task.id,
      });
      await createNotification(tx, {
        receiverId: recipient.id,
        actorId: input.template.createdById,
        type: TASK_NOTIFICATION.TASK_ASSIGNED,
        title: 'New task assigned',
        body: 'A new task has been assigned to you.',
        targetType: 'TASK',
        targetId: task.id,
      });
      mails.push({
        responsibleUserId: recipient.id,
        responsibleName: recipient.name,
        responsibleEmail: recipient.email,
        taskId: task.publicId,
        referenceCode: task.referenceCode,
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt,
        assignmentNote: null,
      });
    }
    return { batchPublicId: batch.publicId, mails };
  }

  private async resolveRecipients(
    tx: PrismaTransactionClient,
    scope: TaskBatchScope,
    teamId: string | null,
  ): Promise<BulkRecipient[]> {
    const select = {
      id: true,
      name: true,
      email: true,
      role: true,
      teamMembership: {
        select: {
          team: {
            select: {
              id: true,
              admin: { select: { id: true, role: true, status: true } },
            },
          },
        },
      },
    } as const;
    if (scope === TaskBatchScope.GLOBAL) {
      return tx.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          role: { in: [UserRole.ADMIN, UserRole.MEMBER] },
        },
        select,
        orderBy: [{ role: 'asc' }, { id: 'asc' }],
      });
    }
    if (!teamId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
        'The selected Team is unavailable.',
      );
    }
    return tx.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          {
            role: UserRole.ADMIN,
            administeredTeams: { some: { id: teamId } },
          },
          { role: UserRole.MEMBER, teamMembership: { teamId } },
        ],
      },
      select: {
        ...select,
      },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
    });
  }

  private assertRecipients(recipients: BulkRecipient[]): void {
    if (recipients.length === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
        'No active Admin or Member recipients are available.',
      );
    }
    for (const recipient of recipients) {
      if (recipient.role !== UserRole.MEMBER) continue;
      const reviewer = recipient.teamMembership?.team.admin;
      if (
        reviewer?.role !== UserRole.ADMIN ||
        reviewer.status !== UserStatus.ACTIVE
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
          'Every active Member must have an active Team Admin reviewer.',
        );
      }
    }
  }

  private assertScope(scope: TaskBatchScope, teamId?: string): void {
    const invalid =
      (scope === TaskBatchScope.TEAM && !teamId) ||
      (scope === TaskBatchScope.GLOBAL && teamId !== undefined);
    if (invalid) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.VALIDATION_ERROR,
        'Bulk recipient scope and Team selection are invalid.',
      );
    }
  }

  private async resolveTeamId(
    tx: PrismaTransactionClient,
    scope: TaskBatchScope,
    publicId?: string,
  ): Promise<string | null> {
    if (scope === TaskBatchScope.GLOBAL) return null;
    const team = await tx.team.findFirst({
      where: {
        publicId: publicId!,
        admin: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      },
      select: { id: true },
    });
    if (!team) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE,
        'The selected Team must have an active Admin.',
      );
    }
    return team.id;
  }

  private async resolveCategoryId(
    tx: PrismaTransactionClient,
    publicId?: string,
  ): Promise<string | null> {
    if (!publicId) return null;
    const category = await tx.taskCategory.findUnique({
      where: { publicId },
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

  private async recordBlocked(
    tx: PrismaTransactionClient,
    recurrence: {
      id: string;
      createdById: string;
      createdBy: { status: UserStatus };
      lastBlockedOccurrenceKey: string | null;
      lastBlockedReason: TaskRecurrenceBlockedReason | null;
    },
    occurrenceKey: string,
    reason: TaskRecurrenceBlockedReason,
    now: Date,
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
      entityType: 'TASK_BATCH_RECURRENCE',
      entityId: recurrence.id,
      metadata: { reason },
    });
    const receivers =
      recurrence.createdBy.status === UserStatus.ACTIVE
        ? [recurrence.createdById]
        : (
            await tx.user.findMany({
              where: {
                role: UserRole.SUPER_ADMIN,
                status: UserStatus.ACTIVE,
              },
              select: { id: true },
            })
          ).map(({ id }) => id);
    for (const receiverId of [...new Set(receivers)]) {
      await createNotification(tx, {
        receiverId,
        actorId: null,
        type: TASK_NOTIFICATION.TASK_RECURRENCE_BLOCKED,
        title: 'Recurring bulk task generation blocked',
        body: 'A recurring bulk task needs configuration attention.',
        targetType: 'TASK_BATCH_RECURRENCE',
        targetId: recurrence.id,
      });
    }
    await tx.taskBatchRecurrence.update({
      where: { id: recurrence.id },
      data: {
        lastBlockedOccurrenceKey: occurrenceKey,
        lastBlockedReason: reason,
        lastBlockedNotifiedAt: now,
      },
      select: { id: true },
    });
  }

  private toResponse(
    batchId: string,
    recipients: BulkRecipient[],
  ): BulkTaskResponse {
    const admins = recipients.filter(
      (recipient) => recipient.role === UserRole.ADMIN,
    ).length;
    return {
      batchId,
      recipients: {
        total: recipients.length,
        admins,
        members: recipients.length - admins,
      },
      createdTasks: recipients.length,
    };
  }

  private async sendAssignmentMails(
    mails: TaskAssignedEmailInput[],
  ): Promise<void> {
    await Promise.allSettled(
      mails.map((mail) => this.sendAssignmentBestEffort(mail)),
    );
  }

  private async sendAssignmentBestEffort(
    mail: TaskAssignedEmailInput,
  ): Promise<void> {
    try {
      await this.mailService.sendTaskAssignedEmail(mail);
    } catch (error) {
      this.logger.warn('Bulk task assignment email failed.', {
        eventId: mail.taskId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

function isOccurrenceUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
