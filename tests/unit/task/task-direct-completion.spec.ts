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

const TASK_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

function createViewer(role: UserRole, userId: string): OperixViewer {
  return {
    userId,
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : role === UserRole.ADMIN
          ? { type: 'ADMIN', teamIds: ['team-db'] }
          : { type: 'MEMBER', teamId: 'team-db' },
  };
}

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-db',
    status: TaskStatus.IN_PROGRESS,
    scope: TaskScope.TEAM,
    completionMode: TaskCompletionMode.DIRECT,
    recurrenceId: null,
    team: { adminId: 'team-admin-db' },
    ...overrides,
  };
}

function createUpdatedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-db',
    publicId: TASK_PUBLIC_ID,
    referenceCode: 'TASK-20260907-ABC123',
    title: 'Direct work',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.COMPLETED,
    scope: TaskScope.TEAM,
    dueAt: new Date('2026-09-08T11:00:00.000Z'),
    startedAt: new Date('2026-09-07T10:00:00.000Z'),
    completedAt: new Date('2026-09-07T11:00:00.000Z'),
    cancelledAt: null,
    completionMode: TaskCompletionMode.DIRECT,
    completionNote: 'Done safely',
    allowSelfClaim: false,
    scheduledStartAt: null,
    occurrenceKey: null,
    team: { publicId: 'team-public', name: 'Operations' },
    category: null,
    createdBy: {
      publicId: 'owner-public',
      name: 'Owner',
      role: UserRole.ADMIN,
      employeeId: null,
      designation: null,
    },
    assignments: [
      {
        responsibleUser: {
          publicId: 'responsible-public',
          name: 'Responsible',
          role: UserRole.MEMBER,
          employeeId: null,
          designation: null,
        },
      },
    ],
    recurrence: null,
    reminder: null,
    distribution: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-07T11:00:00.000Z'),
    ...overrides,
  };
}

function createTx(
  input: {
    task?: Record<string, unknown>;
    assignment?: { id: string; responsibleUserId: string } | null;
    updatedTask?: Record<string, unknown>;
  } = {},
) {
  const tx = {
    task: {
      findFirst: jestApi.fn().mockResolvedValue(input.task ?? createTask()),
      update: jestApi
        .fn()
        .mockResolvedValue(input.updatedTask ?? createUpdatedTask()),
    },
    taskAssignment: {
      findFirst: jestApi
        .fn()
        .mockResolvedValue(
          input.assignment === undefined
            ? { id: 'assignment-db', responsibleUserId: 'responsible-db' }
            : input.assignment,
        ),
    },
    taskReminder: {
      updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
    },
    taskStatusHistory: {
      create: jestApi.fn().mockResolvedValue({ id: 'history-db' }),
    },
    activityLog: {
      create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
    },
  };

  const prisma = {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;

  const recurrenceService = {
    reconcileRecurrence: jestApi.fn().mockResolvedValue(false),
  };

  const service = new TaskService(
    prisma,
    { sendTaskAssignedEmail: jestApi.fn() } as never,
    recurrenceService as never,
  );

  return { service, tx, recurrenceService };
}

function expectTaskCompletionNote(
  tx: ReturnType<typeof createTx>['tx'],
  completionNote: string | null,
): void {
  const updateMock = tx.task.update as unknown as {
    mock: {
      calls: [{ data: { completionNote?: string | null } }][];
    };
  };
  expect(updateMock.mock.calls[0]?.[0].data.completionNote).toBe(
    completionNote,
  );
}

function expectStatusHistory(
  tx: ReturnType<typeof createTx>['tx'],
  expected: { changedById?: string; notes?: string },
): void {
  const createMock = tx.taskStatusHistory.create as unknown as {
    mock: {
      calls: [{ data: { changedById?: string; notes?: string } }][];
    };
  };
  const data = createMock.mock.calls[0]?.[0].data;
  expect(data).toMatchObject(expected);
}

describe('TaskService direct completion', () => {
  it('keeps responsible completion behavior, normalizes the note, and cancels reminders', async () => {
    const { service, tx } = createTx();

    const result = await service.completeTask(
      createViewer(UserRole.ADMIN, 'responsible-db'),
      TASK_PUBLIC_ID,
      { completionNote: '  Done safely  ' },
    );

    expect(result.status).toBe(TaskStatus.COMPLETED);
    expectTaskCompletionNote(tx, 'Done safely');
    expect(tx.taskReminder.updateMany).toHaveBeenCalledWith({
      where: { taskId: 'task-db', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expectStatusHistory(tx, {
      changedById: 'responsible-db',
      notes: 'Task completed directly.',
    });
  });

  it('allows a Responsible Admin to complete a GLOBAL Task as Responsible', async () => {
    const { service, tx } = createTx({
      task: createTask({ scope: TaskScope.GLOBAL, team: null }),
      assignment: { id: 'assignment-db', responsibleUserId: 'admin-db' },
      updatedTask: createUpdatedTask({ scope: TaskScope.GLOBAL, team: null }),
    });

    await expect(
      service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).resolves.toMatchObject({ status: TaskStatus.COMPLETED });
    expectStatusHistory(tx, { notes: 'Task completed directly.' });
  });

  it('allows Responsible authorization before malformed Team override state', async () => {
    const { service } = createTx({
      task: createTask({ scope: TaskScope.TEAM, team: null }),
      assignment: { id: 'assignment-db', responsibleUserId: 'admin-db' },
    });

    await expect(
      service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).resolves.toMatchObject({ status: TaskStatus.COMPLETED });
  });

  it('allows Super Admin override for TEAM and GLOBAL Tasks', async () => {
    const teamCase = createTx({
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });
    await expect(
      teamCase.service.completeTask(
        createViewer(UserRole.SUPER_ADMIN, 'chief-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).resolves.toMatchObject({ status: TaskStatus.COMPLETED });
    expectStatusHistory(teamCase.tx, {
      changedById: 'chief-db',
      notes: 'Task completed directly by administrative override.',
    });

    const globalCase = createTx({
      task: createTask({ scope: TaskScope.GLOBAL, team: null }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
      updatedTask: createUpdatedTask({ scope: TaskScope.GLOBAL, team: null }),
    });
    await expect(
      globalCase.service.completeTask(
        createViewer(UserRole.SUPER_ADMIN, 'chief-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).resolves.toMatchObject({ status: TaskStatus.COMPLETED });
  });

  it('allows only the current Team Admin override for TEAM Tasks', async () => {
    const formerAdminCase = createTx({
      task: createTask({ team: { adminId: 'new-admin-db' } }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });

    await expect(
      formerAdminCase.service.completeTask(
        createViewer(UserRole.ADMIN, 'former-admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });
    expect(formerAdminCase.tx.task.update).not.toHaveBeenCalled();

    const currentAdminCase = createTx({
      task: createTask({ team: { adminId: 'new-admin-db' } }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });

    await expect(
      currentAdminCase.service.completeTask(
        createViewer(UserRole.ADMIN, 'new-admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).resolves.toMatchObject({ status: TaskStatus.COMPLETED });
    expectStatusHistory(currentAdminCase.tx, {
      changedById: 'new-admin-db',
      notes: 'Task completed directly by administrative override.',
    });
  });

  it('denies Admin override for GLOBAL and malformed TEAM Tasks', async () => {
    const globalCase = createTx({
      task: createTask({ scope: TaskScope.GLOBAL, team: null }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });
    await expect(
      globalCase.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });

    const malformedTeamCase = createTx({
      task: createTask({ scope: TaskScope.TEAM, team: null }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });
    await expect(
      malformedTeamCase.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });
  });

  it('denies a nonresponsible Member with TASK_NOT_RESPONSIBLE', async () => {
    const { service } = createTx({
      assignment: { id: 'assignment-db', responsibleUserId: 'other-member-db' },
    });

    await expect(
      service.completeTask(
        createViewer(UserRole.MEMBER, 'member-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: TASK_ERROR_CODE.TASK_NOT_RESPONSIBLE },
    });
  });

  it('requires a current active assignment even for administrative override', async () => {
    const superAdminCase = createTx({ assignment: null });
    await expect(
      superAdminCase.service.completeTask(
        createViewer(UserRole.SUPER_ADMIN, 'chief-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: TASK_ERROR_CODE.TASK_NOT_RESPONSIBLE },
    });
    expect(superAdminCase.tx.task.update).not.toHaveBeenCalled();

    const teamAdminCase = createTx({
      assignment: null,
      task: createTask({ team: { adminId: 'admin-db' } }),
    });
    await expect(
      teamAdminCase.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: TASK_ERROR_CODE.TASK_NOT_RESPONSIBLE },
    });
    expect(teamAdminCase.tx.task.update).not.toHaveBeenCalled();
  });

  it('checks authorization before workflow-state disclosure', async () => {
    const unauthorizedCompleted = createTx({
      task: createTask({
        status: TaskStatus.COMPLETED,
        team: { adminId: 'other-admin-db' },
      }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });

    await expect(
      unauthorizedCompleted.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });

    const authorizedCompleted = createTx({
      task: createTask({
        status: TaskStatus.COMPLETED,
        team: { adminId: 'admin-db' },
      }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });

    await expect(
      authorizedCompleted.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_ALREADY_COMPLETED },
    });
  });

  it('preserves DIRECT workflow status rules for authorized overrides', async () => {
    const reviewRequired = createTx({
      task: createTask({
        completionMode: TaskCompletionMode.REVIEW_REQUIRED,
        team: { adminId: 'admin-db' },
      }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });
    await expect(
      reviewRequired.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_DIRECT_COMPLETION_NOT_ALLOWED },
    });

    const assigned = createTx({
      task: createTask({
        status: TaskStatus.ASSIGNED,
        team: { adminId: 'admin-db' },
      }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });
    await expect(
      assigned.service.completeTask(
        createViewer(UserRole.ADMIN, 'admin-db'),
        TASK_PUBLIC_ID,
        {},
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_INVALID_STATUS_TRANSITION },
    });
  });

  it('preserves recurrence reconciliation after override completion', async () => {
    const { service, recurrenceService } = createTx({
      task: createTask({
        recurrenceId: 'recurrence-db',
        team: { adminId: 'admin-db' },
      }),
      assignment: { id: 'assignment-db', responsibleUserId: 'member-db' },
    });

    await service.completeTask(
      createViewer(UserRole.ADMIN, 'admin-db'),
      TASK_PUBLIC_ID,
      {},
    );

    expect(recurrenceService.reconcileRecurrence).toHaveBeenCalledWith(
      'recurrence-db',
      expect.any(Date),
    );
  });
});
