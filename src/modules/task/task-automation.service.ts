import { Injectable, Logger } from '@nestjs/common';
import {
  TaskReminderStatus,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { MailService } from '../../shared/mail/mail.service.js';
import type { TaskReminderEmailInput } from '../../shared/mail/mail.interface.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import { TASK_ACTIVITY, TASK_NOTIFICATION } from './task.constant.js';
import { TaskRecurrenceService } from './task-recurrence.service.js';
import { TaskDistributionService } from './task-distribution.service.js';

const REMINDER_BATCH_SIZE = 50;

@Injectable()
export class TaskAutomationService {
  private readonly logger = new Logger(TaskAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrenceService: TaskRecurrenceService,
    private readonly mailService: MailService,
    private readonly distributionService: TaskDistributionService,
  ) {}

  async run(now = new Date()) {
    const reminders = await this.processDueReminders(now);
    const recurrences =
      await this.recurrenceService.reconcileDueRecurrences(now);
    const distributions =
      await this.distributionService.processDueDistributions(now);
    return { reminders, recurrences, distributions };
  }

  async processDueReminders(now: Date): Promise<{
    eligible: number;
    sent: number;
    cancelled: number;
  }> {
    const reminders = await this.prisma.taskReminder.findMany({
      where: { status: TaskReminderStatus.PENDING, scheduledAt: { lte: now } },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: REMINDER_BATCH_SIZE,
      select: { id: true },
    });
    let sent = 0;
    let cancelled = 0;
    for (const reminder of reminders) {
      const result = await this.processReminder(reminder.id, now);
      if (result === 'sent') sent += 1;
      if (result === 'cancelled') cancelled += 1;
    }
    return { eligible: reminders.length, sent, cancelled };
  }

  private async processReminder(
    reminderId: string,
    now: Date,
  ): Promise<'sent' | 'cancelled' | 'noop'> {
    const result = await runSerializableTransaction(this.prisma, async (tx) => {
      const reminder = await tx.taskReminder.findUnique({
        where: { id: reminderId },
        select: {
          id: true,
          status: true,
          task: {
            select: {
              id: true,
              publicId: true,
              referenceCode: true,
              title: true,
              dueAt: true,
              status: true,
              assignments: {
                where: { unassignedAt: null },
                take: 1,
                select: {
                  responsibleUser: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (reminder?.status !== TaskReminderStatus.PENDING) {
        return { state: 'noop' as const, mail: null };
      }
      if (
        reminder.task.status === TaskStatus.COMPLETED ||
        reminder.task.status === TaskStatus.CANCELLED
      ) {
        const claimed = await tx.taskReminder.updateMany({
          where: { id: reminder.id, status: TaskReminderStatus.PENDING },
          data: { status: TaskReminderStatus.CANCELLED },
        });
        return {
          state:
            claimed.count === 1 ? ('cancelled' as const) : ('noop' as const),
          mail: null,
        };
      }
      const responsible = reminder.task.assignments[0]?.responsibleUser;
      if (!responsible) return { state: 'noop' as const, mail: null };
      const claimed = await tx.taskReminder.updateMany({
        where: { id: reminder.id, status: TaskReminderStatus.PENDING },
        data: { status: TaskReminderStatus.SENT, sentAt: now },
      });
      if (claimed.count !== 1) return { state: 'noop' as const, mail: null };
      await createNotification(tx, {
        receiverId: responsible.id,
        actorId: null,
        type: TASK_NOTIFICATION.TASK_REMINDER,
        title: 'Task deadline reminder',
        body: "A task you're responsible for is approaching its deadline.",
        targetType: 'TASK',
        targetId: reminder.task.id,
      });
      await writeActivity(tx, {
        actorId: null,
        action: TASK_ACTIVITY.TASK_REMINDER_SENT,
        entityType: 'TASK',
        entityId: reminder.task.id,
      });
      const mail: TaskReminderEmailInput = {
        responsibleUserId: responsible.id,
        responsibleName: responsible.name,
        responsibleEmail: responsible.email,
        taskId: reminder.task.publicId,
        referenceCode: reminder.task.referenceCode,
        title: reminder.task.title,
        dueAt: reminder.task.dueAt,
      };
      return { state: 'sent' as const, mail };
    });
    if (result.mail) {
      await this.mailService
        .sendTaskReminderEmail(result.mail)
        .catch((error: unknown) => {
          this.logger.warn('Task reminder email failed.', {
            eventId: result.mail?.taskId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        });
    }
    return result.state;
  }
}
