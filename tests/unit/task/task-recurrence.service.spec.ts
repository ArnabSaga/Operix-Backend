import type { ConfigService } from '@nestjs/config';
import {
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import { PrismaService } from '../../../src/database/prisma.service';
import { TaskRecurrenceService } from '../../../src/modules/task/task-recurrence.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const recurrenceId = 'recurrence-db';
const recurrencePublicId = '44444444-4444-4444-8444-444444444444';
const dueAt = new Date('2026-11-05T03:00:00.000Z');
const now = new Date('2026-11-05T04:00:00.000Z');

const viewer: OperixViewer = {
  userId: 'owner-db',
  role: UserRole.SUPER_ADMIN,
  status: UserStatus.ACTIVE,
  scope: { type: 'GLOBAL' },
};

function configService(): ConfigService<ApplicationConfiguration, true> {
  return {
    get: jestApi.fn().mockReturnValue('Asia/Dhaka'),
  } as unknown as ConfigService<ApplicationConfiguration, true>;
}

function recurrenceResponse(distributionLeadMinutes: number | null) {
  return {
    id: recurrenceId,
    publicId: recurrencePublicId,
    frequency: TaskRecurrenceFrequency.MONTHLY,
    scope: TaskScope.GLOBAL,
    title: 'Monthly Financial Submission',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    anchorDueAt: new Date('2026-10-05T03:00:00.000Z'),
    anchorLocalDay: 5,
    anchorLocalWeekday: null,
    anchorLocalTime: '09:00:00',
    nextOccurrenceAt: dueAt,
    reminderLeadMinutes: 1_440,
    isActive: true,
    broadcastAll: distributionLeadMinutes !== null,
    distributionLeadMinutes,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    createdBy: {
      publicId: '22222222-2222-4222-8222-222222222222',
      name: 'Owner',
      role: UserRole.SUPER_ADMIN,
      employeeId: null,
      designation: null,
    },
    defaultResponsibleUser: {
      publicId: '33333333-3333-4333-8333-333333333333',
      name: 'Responsible',
      role: UserRole.ADMIN,
      employeeId: null,
      designation: null,
    },
    team: null,
    category: null,
  };
}

function transactionPrisma(tx: Record<string, unknown>): PrismaService {
  return {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
}

function generationRecurrence(distributionLeadMinutes: number | null) {
  return {
    id: recurrenceId,
    publicId: recurrencePublicId,
    isActive: true,
    frequency: TaskRecurrenceFrequency.MONTHLY,
    scope: TaskScope.GLOBAL,
    title: 'Monthly Financial Submission',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    anchorDueAt: new Date('2026-10-05T03:00:00.000Z'),
    anchorLocalDay: 5,
    anchorLocalWeekday: null,
    anchorLocalTime: '09:00:00',
    nextOccurrenceAt: dueAt,
    reminderLeadMinutes: 1_440,
    broadcastAll: distributionLeadMinutes !== null,
    distributionLeadMinutes,
    lastBlockedOccurrenceKey: null,
    lastBlockedReason: null,
    lastBlockedNotifiedAt: null,
    teamId: null,
    categoryId: null,
    createdById: 'owner-db',
    defaultResponsibleUserId: 'responsible-db',
    defaultResponsibleUser: {
      id: 'responsible-db',
      name: 'Responsible',
      email: 'responsible@example.com',
      status: UserStatus.ACTIVE as UserStatus,
    },
    createdBy: {
      id: 'owner-db',
      status: UserStatus.ACTIVE as UserStatus,
    },
    team: null,
    tasks: [
      {
        id: 'october-task-db',
        dueAt: new Date('2026-10-05T03:00:00.000Z'),
        status: TaskStatus.COMPLETED,
        occurrenceKey: '2026-10-05',
      },
    ],
  };
}

describe('TaskRecurrenceService distribution updates', () => {
  it('updates the series lead without changing an existing occurrence distribution', async () => {
    const existing = {
      id: recurrenceId,
      createdById: 'owner-db',
      isActive: true,
      frequency: TaskRecurrenceFrequency.MONTHLY,
      anchorDueAt: new Date('2026-10-05T03:00:00.000Z'),
      anchorLocalDay: 5,
      anchorLocalWeekday: null,
      anchorLocalTime: '09:00:00',
      nextOccurrenceAt: dueAt,
      scope: TaskScope.GLOBAL,
    };
    const taskDistribution = {
      update: jestApi.fn(),
      updateMany: jestApi.fn(),
    };
    const tx = {
      taskRecurrence: {
        findUnique: jestApi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              'publicId' in where ? existing : { publicId: recurrencePublicId },
            ),
          ),
        update: jestApi.fn().mockResolvedValue(recurrenceResponse(720)),
      },
      taskDistribution,
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
      },
    };
    const service = new TaskRecurrenceService(
      transactionPrisma(tx),
      {} as never,
      configService(),
    );

    const result = await service.updateRecurrence(viewer, recurrencePublicId, {
      distributionLeadMinutes: 720,
    });

    expect(tx.taskRecurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          broadcastAll: true,
          distributionLeadMinutes: 720,
        }) as object,
      }),
    );
    expect(result.distributionLeadMinutes).toBe(720);
    expect(taskDistribution.update).not.toHaveBeenCalled();
    expect(taskDistribution.updateMany).not.toHaveBeenCalled();
  });

  it('disables only future distributions when the series lead becomes null', async () => {
    const existing = {
      id: recurrenceId,
      createdById: 'owner-db',
      isActive: true,
      frequency: TaskRecurrenceFrequency.MONTHLY,
      anchorDueAt: new Date('2026-10-05T03:00:00.000Z'),
      anchorLocalDay: 5,
      anchorLocalWeekday: null,
      anchorLocalTime: '09:00:00',
      nextOccurrenceAt: dueAt,
      scope: TaskScope.GLOBAL,
    };
    const taskDistribution = { updateMany: jestApi.fn() };
    const tx = {
      taskRecurrence: {
        findUnique: jestApi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              'publicId' in where ? existing : { publicId: recurrencePublicId },
            ),
          ),
        update: jestApi.fn().mockResolvedValue(recurrenceResponse(null)),
      },
      taskDistribution,
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
      },
    };
    const service = new TaskRecurrenceService(
      transactionPrisma(tx),
      {} as never,
      configService(),
    );

    const result = await service.updateRecurrence(viewer, recurrencePublicId, {
      distributionLeadMinutes: null,
    });

    expect(tx.taskRecurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          broadcastAll: false,
          distributionLeadMinutes: null,
        }) as object,
      }),
    );
    expect(result.distributionLeadMinutes).toBeNull();
    expect(taskDistribution.updateMany).not.toHaveBeenCalled();
  });
});

describe('TaskRecurrenceService future occurrence distribution', () => {
  it('uses the updated lead for the next generated occurrence', async () => {
    const recurrence = generationRecurrence(720);
    const tx = generationTransaction(recurrence);
    const mailService = {
      sendTaskAssignedEmail: jestApi.fn().mockResolvedValue(undefined),
    };
    const service = new TaskRecurrenceService(
      transactionPrisma(tx),
      mailService as never,
      configService(),
    );

    await expect(service.reconcileRecurrence(recurrenceId, now)).resolves.toBe(
      'generated',
    );

    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurrenceId,
          occurrenceKey: '2026-11-05',
          scope: TaskScope.GLOBAL,
          teamId: null,
          createdById: 'owner-db',
          assignments: {
            create: {
              responsibleUserId: 'responsible-db',
              assignedById: 'owner-db',
            },
          },
          reminder: {
            create: {
              scheduledAt: new Date('2026-11-04T03:00:00.000Z'),
            },
          },
          distribution: {
            create: {
              scheduledAt: new Date('2026-11-04T15:00:00.000Z'),
            },
          },
        }) as object,
      }),
    );
    expect(mailService.sendTaskAssignedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '55555555-5555-4555-8555-555555555555',
        referenceCode: 'TASK-20261105-ABC123',
      }),
    );
    expect(tx.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: recurrenceId },
      data: {
        nextOccurrenceAt: new Date('2026-12-05T03:00:00.000Z'),
        lastBlockedOccurrenceKey: null,
        lastBlockedReason: null,
        lastBlockedNotifiedAt: null,
      },
    });
  });

  it('creates no future distribution after the series lead is disabled', async () => {
    const recurrence = generationRecurrence(null);
    const tx = generationTransaction(recurrence);
    const service = new TaskRecurrenceService(
      transactionPrisma(tx),
      {
        sendTaskAssignedEmail: jestApi.fn().mockResolvedValue(undefined),
      } as never,
      configService(),
    );

    await expect(service.reconcileRecurrence(recurrenceId, now)).resolves.toBe(
      'generated',
    );

    const taskData = (
      tx.task.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(taskData.data).not.toHaveProperty('distribution');
  });
});

describe('TaskRecurrenceService blocked recurrence deduplication', () => {
  it('writes one operational event for the same occurrence and reason', async () => {
    const recurrence = {
      ...generationRecurrence(null),
      defaultResponsibleUser: {
        id: 'responsible-db',
        name: 'Responsible',
        email: 'responsible@example.com',
        status: UserStatus.SUSPENDED,
      },
    };
    const tx = generationTransaction(recurrence);
    tx.taskRecurrence.update.mockImplementation(({ data }) => {
      Object.assign(recurrence, data);
      return Promise.resolve({ id: recurrenceId });
    });
    const service = new TaskRecurrenceService(
      transactionPrisma(tx),
      {} as never,
      configService(),
    );

    await expect(service.reconcileRecurrence(recurrenceId, now)).resolves.toBe(
      'blocked',
    );
    await expect(service.reconcileRecurrence(recurrenceId, now)).resolves.toBe(
      'blocked',
    );

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
  });
});

function generationTransaction(
  recurrence: ReturnType<typeof generationRecurrence>,
) {
  const taskPublicId = '55555555-5555-4555-8555-555555555555';

  return {
    taskRecurrence: {
      findUnique: jestApi.fn().mockResolvedValue(recurrence),
      update: jestApi.fn().mockResolvedValue({ id: recurrenceId }),
    },
    task: {
      findUnique: jestApi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            'recurrenceId_occurrenceKey' in where
              ? null
              : { publicId: taskPublicId },
          ),
        ),
      create: jestApi.fn().mockResolvedValue({
        id: 'november-task-db',
        publicId: taskPublicId,
        referenceCode: 'TASK-20261105-ABC123',
        title: recurrence.title,
        priority: recurrence.priority,
        dueAt,
      }),
    },
    taskStatusHistory: {
      createMany: jestApi.fn().mockResolvedValue({ count: 2 }),
    },
    activityLog: {
      create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
    },
    notification: {
      create: jestApi.fn().mockResolvedValue({ id: 'notification-db' }),
    },
  };
}
