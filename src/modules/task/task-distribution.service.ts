import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  TaskDistributionStatus,
  TaskScope,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
} from './task.constant.js';

const DISTRIBUTION_BATCH_SIZE = 50;

interface SafeTaskDistributionResponse {
  status: TaskDistributionStatus;
  scheduledAt: Date;
  sentAt: Date | null;
}

@Injectable()
export class TaskDistributionService {
  private readonly logger = new Logger(TaskDistributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reschedule(
    viewer: OperixViewer,
    taskPublicId: string,
    scheduledAt: Date,
  ): Promise<SafeTaskDistributionResponse> {
    const result = await runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findUnique({
        where: { publicId: taskPublicId },
        select: {
          id: true,
          createdById: true,
          scope: true,
          distribution: { select: { id: true, status: true } },
        },
      });
      this.assertManageable(viewer, task);
      const distribution = await tx.taskDistribution.update({
        where: { id: task!.distribution!.id },
        data: { scheduledAt },
        select: { status: true, scheduledAt: true, sentAt: true },
      });
      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_DISTRIBUTION_RESCHEDULED,
        entityType: 'TASK',
        entityId: task!.id,
      });
      return { distribution, distributionId: task!.distribution!.id };
    });

    if (scheduledAt <= new Date()) {
      await this.processDistribution(result.distributionId, new Date()).catch(
        (error: unknown) => {
          this.logger.warn('Immediate rescheduled distribution failed.', {
            eventId: taskPublicId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        },
      );
      return this.getByTaskPublicId(taskPublicId);
    }
    return result.distribution;
  }

  async cancel(
    viewer: OperixViewer,
    taskPublicId: string,
  ): Promise<SafeTaskDistributionResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const task = await tx.task.findUnique({
        where: { publicId: taskPublicId },
        select: {
          id: true,
          createdById: true,
          scope: true,
          distribution: { select: { id: true, status: true } },
        },
      });
      this.assertManageable(viewer, task);
      const distribution = await tx.taskDistribution.update({
        where: { id: task!.distribution!.id },
        data: { status: TaskDistributionStatus.CANCELLED },
        select: { status: true, scheduledAt: true, sentAt: true },
      });
      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TASK_ACTIVITY.TASK_DISTRIBUTION_CANCELLED,
        entityType: 'TASK',
        entityId: task!.id,
      });
      return distribution;
    });
  }

  async processDueDistributions(now: Date): Promise<{
    eligible: number;
    sent: number;
    recipients: number;
  }> {
    const due = await this.prisma.taskDistribution.findMany({
      where: {
        status: TaskDistributionStatus.PENDING,
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: DISTRIBUTION_BATCH_SIZE,
      select: { id: true },
    });
    let sent = 0;
    let recipients = 0;
    for (const distribution of due) {
      const result = await this.processDistribution(distribution.id, now);
      if (result.state === 'sent') {
        sent += 1;
        recipients += result.recipients;
      }
    }
    return { eligible: due.length, sent, recipients };
  }

  async processDistribution(
    distributionId: string,
    now: Date,
  ): Promise<{ state: 'sent' | 'noop'; recipients: number }> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const distribution = await tx.taskDistribution.findUnique({
        where: { id: distributionId },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          task: {
            select: {
              id: true,
              publicId: true,
              scope: true,
              title: true,
              dueAt: true,
              createdBy: { select: { name: true } },
            },
          },
        },
      });
      if (
        distribution?.status !== TaskDistributionStatus.PENDING ||
        distribution.scheduledAt > now ||
        distribution.task.scope !== TaskScope.GLOBAL
      ) {
        return { state: 'noop' as const, recipients: 0 };
      }

      const claimed = await tx.taskDistribution.updateMany({
        where: {
          id: distribution.id,
          status: TaskDistributionStatus.PENDING,
          scheduledAt: { lte: now },
        },
        data: { status: TaskDistributionStatus.SENT, sentAt: now },
      });
      if (claimed.count !== 1) {
        return { state: 'noop' as const, recipients: 0 };
      }

      const users = await tx.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER] },
        },
        select: { id: true },
      });
      const receiverIds = [...new Set(users.map((user) => user.id))];
      if (receiverIds.length > 0) {
        await tx.notification.createMany({
          data: receiverIds.map((receiverId) => ({
            receiverId,
            actorId: null,
            type: TASK_NOTIFICATION.TASK_GLOBAL_DISTRIBUTION,
            title: 'Global Task',
            body: `${distribution.task.createdBy.name} published "${distribution.task.title}".`,
            targetType: 'TASK',
            targetId: distribution.task.id,
            targetPublicId: distribution.task.publicId,
          })),
        });
      }
      await writeActivity(tx, {
        actorId: null,
        action: TASK_ACTIVITY.TASK_DISTRIBUTION_SENT,
        entityType: 'TASK',
        entityId: distribution.task.id,
        metadata: {
          taskId: distribution.task.publicId,
          scope: TaskScope.GLOBAL,
          ...(distribution.task.dueAt
            ? { dueAt: distribution.task.dueAt.toISOString() }
            : {}),
        },
      });
      return { state: 'sent' as const, recipients: receiverIds.length };
    });
  }

  private async getByTaskPublicId(
    taskPublicId: string,
  ): Promise<SafeTaskDistributionResponse> {
    const task = await this.prisma.task.findUnique({
      where: { publicId: taskPublicId },
      select: {
        distribution: {
          select: { status: true, scheduledAt: true, sentAt: true },
        },
      },
    });
    if (!task?.distribution) throw this.notFound();
    return task.distribution;
  }

  private assertManageable(
    viewer: OperixViewer,
    task: {
      id: string;
      createdById: string;
      scope: TaskScope;
      distribution: { id: string; status: TaskDistributionStatus } | null;
    } | null,
  ): void {
    if (task?.scope !== TaskScope.GLOBAL || !task.distribution) {
      throw this.notFound();
    }
    if (
      viewer.role !== UserRole.SUPER_ADMIN &&
      task.createdById !== viewer.userId
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this action.',
      );
    }
    if (task.distribution.status !== TaskDistributionStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_DISTRIBUTION_IMMUTABLE,
        'The task distribution can no longer be changed.',
      );
    }
  }

  private notFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_DISTRIBUTION_NOT_FOUND,
      'Task distribution not found.',
    );
  }
}
