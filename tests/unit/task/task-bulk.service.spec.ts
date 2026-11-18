import { HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../../../src/database/prisma.service';
import { TaskBulkService } from '../../../src/modules/task/task-bulk.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import type { MailService } from '../../../src/shared/mail/mail.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import {
  TaskBatchScope,
  TaskCompletionMode,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';

const jestApi = import.meta.jest;
const dueAt = new Date('2099-01-01T09:00:00.000Z');

const viewer: OperixViewer = {
  userId: 'chief-db',
  role: UserRole.SUPER_ADMIN,
  status: UserStatus.ACTIVE,
  scope: { type: 'GLOBAL' },
};

function recipient(
  role: UserRole,
  id: string,
  team = role === UserRole.MEMBER
    ? {
        id: 'team-db',
        admin: {
          id: 'admin-db',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      }
    : null,
) {
  return {
    id,
    publicId: `${id}-public`,
    name: id,
    email: `${id}@example.com`,
    role,
    teamMembership: team ? { team } : null,
  };
}

function createHarness(recipients: ReturnType<typeof recipient>[]) {
  let taskNumber = 0;
  const sendTaskAssignedEmail = jestApi.fn().mockResolvedValue(undefined);
  const tx = {
    team: { findFirst: jestApi.fn().mockResolvedValue({ id: 'team-db' }) },
    user: { findMany: jestApi.fn().mockResolvedValue(recipients) },
    taskCategory: { findUnique: jestApi.fn() },
    taskBatch: {
      create: jestApi.fn().mockResolvedValue({
        id: 'batch-db',
        publicId: 'batch-public',
      }),
      findUnique: jestApi.fn().mockResolvedValue(null),
    },
    taskBatchRecurrence: {
      create: jestApi.fn().mockResolvedValue({ id: 'recurrence-db' }),
      findUnique: jestApi.fn(),
      update: jestApi.fn().mockResolvedValue({ id: 'recurrence-db' }),
    },
    task: {
      create: jestApi
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: { title: string; priority: string; dueAt: Date };
          }) => {
            taskNumber += 1;
            return Promise.resolve({
              id: `task-db-${taskNumber}`,
              publicId: `task-public-${taskNumber}`,
              referenceCode: `TASK-${taskNumber}`,
              title: data.title,
              priority: data.priority,
              dueAt: data.dueAt,
            });
          },
        ),
    },
    taskAssignment: { create: jestApi.fn().mockResolvedValue({}) },
    taskStatusHistory: { createMany: jestApi.fn().mockResolvedValue({}) },
    activityLog: { create: jestApi.fn().mockResolvedValue({}) },
    notification: { create: jestApi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jestApi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  const mail = {
    sendTaskAssignedEmail,
  } as unknown as MailService;
  const config = {
    get: jestApi.fn().mockReturnValue('Asia/Dhaka'),
  };

  return {
    service: new TaskBulkService(prisma, mail, config as never),
    tx,
    sendTaskAssignedEmail,
  };
}

describe('TaskBulkService', () => {
  it('creates one independent review Task per active Admin and Member', async () => {
    const { service, tx, sendTaskAssignedEmail } = createHarness([
      recipient(UserRole.ADMIN, 'admin-db'),
      recipient(UserRole.MEMBER, 'member-db'),
    ]);

    await expect(
      service.createBulkTask(viewer, {
        title: 'Complete annual compliance review',
        dueAt,
        scope: TaskBatchScope.GLOBAL,
      }),
    ).resolves.toEqual({
      batchId: 'batch-public',
      recipients: { total: 2, admins: 1, members: 1 },
      createdTasks: 2,
    });

    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.task.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          scope: TaskScope.INDIVIDUAL,
          status: TaskStatus.ASSIGNED,
          completionMode: TaskCompletionMode.REVIEW_REQUIRED,
          reviewerUserId: 'chief-db',
          teamId: null,
          batchId: 'batch-db',
        }) as object,
      }),
    );
    expect(tx.task.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          reviewerUserId: 'admin-db',
          teamId: 'team-db',
        }) as object,
      }),
    );
    expect(tx.taskAssignment.create).toHaveBeenCalledTimes(2);
    expect(sendTaskAssignedEmail).toHaveBeenCalledTimes(2);
  });

  it('fails before writes when a Member has no active Team Admin reviewer', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.MEMBER, 'member-db', null),
    ]);

    await expect(
      service.createBulkTask(viewer, {
        title: 'Complete annual compliance review',
        dueAt,
        scope: TaskBatchScope.GLOBAL,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_NOT_ASSIGNABLE },
    });
    expect(tx.taskBatch.create).not.toHaveBeenCalled();
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('creates a server-owned recurring batch and links its first occurrence', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.ADMIN, 'admin-db'),
    ]);

    await service.createBulkTask(viewer, {
      title: 'Weekly operations check',
      dueAt,
      scope: TaskBatchScope.GLOBAL,
      recurrence: {
        frequency: TaskRecurrenceFrequency.WEEKLY,
        reminderLeadMinutes: 720,
      },
    });

    expect(tx.taskBatchRecurrence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: TaskBatchScope.GLOBAL,
          frequency: TaskRecurrenceFrequency.WEEKLY,
          reminderLeadMinutes: 720,
          anchorDueAt: dueAt,
        }) as object,
      }),
    );
    const batchCalls = (
      tx.taskBatch.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const batchCreate = batchCalls[0]?.[0] as {
      data: { recurrenceId: string | null; occurrenceKey: string | null };
    };
    expect(batchCreate.data.recurrenceId).toBe('recurrence-db');
    expect(typeof batchCreate.data.occurrenceKey).toBe('string');
  });

  it('limits a Team batch to its active Admin and Members', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.ADMIN, 'admin-db'),
      recipient(UserRole.MEMBER, 'member-db'),
    ]);

    await service.createBulkTask(viewer, {
      title: 'Team operations check',
      dueAt,
      scope: TaskBatchScope.TEAM,
      teamId: 'team-public',
    });

    const teamCalls = (
      tx.team.findFirst as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const recipientCalls = (
      tx.user.findMany as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const teamFind = teamCalls[0]?.[0] as {
      where: { publicId: string };
    };
    const recipientFind = recipientCalls[0]?.[0] as {
      where: { OR: unknown[] };
    };
    expect(teamFind.where.publicId).toBe('team-public');
    expect(recipientFind.where.OR).toHaveLength(2);
  });

  it('re-resolves recipients and materializes the next batch occurrence', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.ADMIN, 'new-admin-db'),
      recipient(UserRole.MEMBER, 'new-member-db'),
    ]);
    tx.taskBatchRecurrence.findUnique.mockResolvedValue(
      recurringTemplate(new Date('2099-01-08T09:00:00.000Z')),
    );

    await expect(
      service.reconcileRecurrence(
        'recurrence-db',
        new Date('2099-01-08T09:01:00.000Z'),
      ),
    ).resolves.toBe('generated');

    expect(tx.user.findMany).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.taskBatchRecurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextOccurrenceAt: new Date('2099-01-15T09:00:00.000Z'),
        }) as object,
      }),
    );
  });

  it('does not replay an already materialized batch occurrence', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.ADMIN, 'admin-db'),
    ]);
    tx.taskBatchRecurrence.findUnique.mockResolvedValue(
      recurringTemplate(new Date('2099-01-08T09:00:00.000Z')),
    );
    tx.taskBatch.findUnique.mockResolvedValue({ id: 'existing-batch-db' });

    await expect(
      service.reconcileRecurrence(
        'recurrence-db',
        new Date('2099-01-08T09:01:00.000Z'),
      ),
    ).resolves.toBe('noop');
    expect(tx.user.findMany).not.toHaveBeenCalled();
    expect(tx.taskBatch.create).not.toHaveBeenCalled();
  });

  it('blocks a Team occurrence atomically when a current reviewer is invalid', async () => {
    const { service, tx } = createHarness([
      recipient(UserRole.MEMBER, 'member-without-reviewer', null),
    ]);
    tx.taskBatchRecurrence.findUnique.mockResolvedValue(
      recurringTemplate(new Date('2099-01-08T09:00:00.000Z'), {
        scope: TaskBatchScope.TEAM,
        teamId: 'team-db',
      }),
    );

    await expect(
      service.reconcileRecurrence(
        'recurrence-db',
        new Date('2099-01-08T09:01:00.000Z'),
      ),
    ).resolves.toBe('blocked');
    expect(tx.taskBatch.create).not.toHaveBeenCalled();
    expect(tx.task.create).not.toHaveBeenCalled();
    expect(tx.taskBatchRecurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastBlockedReason: 'TEAM_NOT_AVAILABLE',
        }) as object,
      }),
    );
  });
});

function recurringTemplate(
  nextOccurrenceAt: Date,
  overrides: Partial<{
    scope: TaskBatchScope;
    teamId: string | null;
  }> = {},
) {
  return {
    id: 'recurrence-db',
    createdById: viewer.userId,
    scope: TaskBatchScope.GLOBAL,
    teamId: null,
    categoryId: null,
    title: 'Weekly operations check',
    description: null,
    remarks: null,
    priority: 'MEDIUM' as const,
    frequency: TaskRecurrenceFrequency.WEEKLY,
    anchorLocalDay: null,
    anchorLocalWeekday: 5,
    anchorLocalTime: '15:00:00',
    nextOccurrenceAt,
    reminderLeadMinutes: null,
    isActive: true,
    lastBlockedOccurrenceKey: null,
    lastBlockedReason: null,
    createdBy: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
    ...overrides,
  };
}
