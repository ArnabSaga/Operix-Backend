import { HttpStatus } from '@nestjs/common';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import { TaskService } from '../../../src/modules/task/task.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const now = new Date('2026-11-08T10:00:00.000Z');

function viewer(role: UserRole, userId: string): OperixViewer {
  return {
    userId,
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : role === UserRole.ADMIN
          ? { type: 'ADMIN', teamIds: ['team-a'] }
          : { type: 'MEMBER', teamId: 'team-a' },
  };
}

function selectedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-private',
    publicId: '11111111-1111-4111-8111-111111111111',
    referenceCode: 'TASK-20261108-ABC123',
    title: 'Original title',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.PENDING,
    scope: TaskScope.TEAM,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    completionMode: TaskCompletionMode.REVIEW_REQUIRED,
    completionNote: null,
    allowSelfClaim: false,
    scheduledStartAt: null,
    occurrenceKey: null,
    team: { publicId: 'team-public', name: 'Team A' },
    category: null,
    reviewer: null,
    batch: null,
    createdBy: {
      publicId: 'owner-public',
      name: 'Owner Admin',
      role: UserRole.ADMIN,
      employeeId: null,
      designation: null,
    },
    assignments: [],
    recurrence: null,
    reminder: null,
    distribution: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(taskOverrides: Record<string, unknown> = {}) {
  const initial = {
    id: 'task-private',
    createdById: 'owner-admin',
    status: TaskStatus.PENDING,
    startedAt: null,
    dueAt: null,
    recurrenceId: null,
    title: 'Original title',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    categoryId: null,
    distribution: null,
    reminder: null,
    ...taskOverrides,
  };
  const result = selectedTask({
    title: 'Updated title',
    status: initial.status,
    startedAt: initial.startedAt,
    dueAt: initial.dueAt,
    distribution: initial.distribution,
    reminder: initial.reminder,
  });
  const tx = {
    task: {
      findFirst: jestApi.fn().mockResolvedValue(initial),
      findUnique: jestApi.fn().mockResolvedValue(result),
      update: jestApi.fn().mockResolvedValue(result),
    },
    taskCategory: { findUnique: jestApi.fn() },
    taskReminder: { update: jestApi.fn() },
    taskDistribution: { update: jestApi.fn() },
    activityLog: { create: jestApi.fn().mockResolvedValue({ id: 'activity' }) },
  };
  const prisma = {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new TaskService(
    prisma as unknown as PrismaService,
    { sendTaskAssignedEmail: jestApi.fn() } as never,
  );
  return { service, tx };
}

function expectCode(error: unknown, status: number, code: string): void {
  const exception = error as {
    getStatus(): number;
    getResponse(): { code: string };
  };
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse().code).toBe(code);
}

describe('TaskService updateTask', () => {
  it('allows the owner Admin to edit an eligible Task and audits changed fields', async () => {
    const { service, tx } = createHarness();

    const result = await service.updateTask(
      viewer(UserRole.ADMIN, 'owner-admin'),
      '11111111-1111-4111-8111-111111111111',
      { title: 'Updated title' },
    );

    expect(result.title).toBe('Updated title');
    expect(tx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-private' },
        data: expect.objectContaining({ title: 'Updated title' }) as object,
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'owner-admin',
        action: 'TASK_UPDATED',
        metadata: { changedFields: ['title'] },
      }) as object,
    });
  });

  it('allows Super Admin on an unstarted assigned Task', async () => {
    const { service } = createHarness({ status: TaskStatus.ASSIGNED });

    await expect(
      service.updateTask(
        viewer(UserRole.SUPER_ADMIN, 'chief'),
        '11111111-1111-4111-8111-111111111111',
        { title: 'Updated title' },
      ),
    ).resolves.toMatchObject({ title: 'Updated title' });
  });

  it('denies a non-owner Admin before lifecycle disclosure', async () => {
    const { service } = createHarness({
      status: TaskStatus.IN_PROGRESS,
      startedAt: now,
    });

    await service
      .updateTask(
        viewer(UserRole.ADMIN, 'other-admin'),
        '11111111-1111-4111-8111-111111111111',
        { title: 'Updated title' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(error, HttpStatus.FORBIDDEN, APP_ERROR_CODE.FORBIDDEN),
      );
  });

  it.each([
    [TaskStatus.ASSIGNED, now],
    [TaskStatus.IN_PROGRESS, now],
    [TaskStatus.SUBMITTED, now],
    [TaskStatus.COMPLETED, now],
    [TaskStatus.CANCELLED, now],
  ])('locks status %s after execution begins', async (status, startedAt) => {
    const { service } = createHarness({ status, startedAt });

    await service
      .updateTask(
        viewer(UserRole.ADMIN, 'owner-admin'),
        '11111111-1111-4111-8111-111111111111',
        { title: 'Updated title' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(
          error,
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_DEFINITION_NOT_EDITABLE,
        ),
      );
  });

  it('locks a sent Global Task for Super Admin', async () => {
    const { service } = createHarness({
      distribution: {
        status: 'SENT',
        scheduledAt: now,
      },
    });

    await service
      .updateTask(
        viewer(UserRole.SUPER_ADMIN, 'chief'),
        '11111111-1111-4111-8111-111111111111',
        { title: 'Updated title' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(
          error,
          HttpStatus.CONFLICT,
          TASK_ERROR_CODE.TASK_DEFINITION_NOT_EDITABLE,
        ),
      );
  });
});
