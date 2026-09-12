import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  TaskCompletionMode,
  TaskDistributionStatus,
  TaskPriority,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  TASK_ACTIVITY,
  TASK_ERROR_CODE,
  TASK_NOTIFICATION,
  TaskSort,
} from '../../../src/modules/task/task.constant';
import { ListTaskQueryDto } from '../../../src/modules/task/dto/list-task-query.dto';
import { CreateTaskDto } from '../../../src/modules/task/dto/create-task.dto';
import { buildTaskScopeWhere } from '../../../src/modules/task/policies/task-scope.policy';
import type { SafeTaskResponse } from '../../../src/modules/task/task.interface';
import { isTaskOverdue } from '../../../src/modules/task/task.mapper';
import {
  buildTaskListWhere,
  getTaskOrderBy,
} from '../../../src/modules/task/task-query';
import { TaskService } from '../../../src/modules/task/task.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

const fixedDate = new Date('2026-08-20T10:00:00.000Z');

function createTaskService(
  prisma: PrismaService,
  mailService = {
    sendTaskAssignedEmail: jestApi.fn().mockResolvedValue(undefined),
  },
): TaskService {
  return new TaskService(
    prisma,
    mailService as unknown as ConstructorParameters<typeof TaskService>[1],
  );
}

function createViewer(role: UserRole): OperixViewer {
  return {
    userId:
      role === UserRole.ADMIN
        ? 'admin-a'
        : role === UserRole.MEMBER
          ? 'member-a'
          : 'chief-a',
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

function createTask(
  overrides: Partial<SafeTaskResponse> = {},
): SafeTaskResponse {
  const task = {
    ...baseTask(),
    ...overrides,
  };
  if (task.team) {
    Object.defineProperty(task.team, 'publicId', {
      value: task.team.id,
      enumerable: false,
    });
  }
  Object.defineProperties(task, {
    publicId: { value: task.id, enumerable: false },
    category: {
      value: task.categoryId ? { publicId: task.categoryId } : null,
      enumerable: false,
    },
    createdBy: {
      value: {
        publicId: task.owner.id,
        name: task.owner.name,
        role: task.owner.role,
        employeeId: task.owner.employeeId,
        designation: task.owner.designation,
      },
      enumerable: false,
    },
    assignments: {
      value: task.responsible
        ? [
            {
              responsibleUser: {
                publicId: task.responsible.id,
                name: task.responsible.name,
                role: task.responsible.role,
                employeeId: task.responsible.employeeId,
                designation: task.responsible.designation,
              },
            },
          ]
        : [],
      enumerable: false,
    },
  });
  return task;
}

function baseTask(): SafeTaskResponse {
  const task = {
    id: 'task-a',
    referenceCode: 'TASK-20260820-ABC123',
    title: 'Prepare batch report',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.PENDING,
    scope: TaskScope.TEAM,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    team: { id: 'team-a', name: 'Team A' },
    categoryId: null,
    owner: {
      id: 'admin-a',
      name: 'Admin A',
      role: UserRole.ADMIN,
      employeeId: null,
      designation: null,
    },
    responsible: null,
    scheduledStartAt: null,
    completionMode: 'REVIEW_REQUIRED' as const,
    completionNote: null,
    allowSelfClaim: false,
    occurrenceKey: null,
    recurrence: null,
    reminder: null,
    distribution: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    isOverdue: false,
  };

  return task;
}

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

describe('task scope policy', () => {
  it('scopes Admin and Member task queries correctly', () => {
    expect(buildTaskScopeWhere(createViewer(UserRole.SUPER_ADMIN))).toEqual({});
    expect(buildTaskScopeWhere(createViewer(UserRole.ADMIN))).toEqual({
      teamId: {
        in: ['team-a'],
      },
    });
    expect(buildTaskScopeWhere(createViewer(UserRole.MEMBER))).toEqual({
      assignments: {
        some: {
          responsibleUserId: 'member-a',
          unassignedAt: null,
        },
      },
    });
  });
});

describe('ListTaskQueryDto', () => {
  it('validates strict booleans and trims search text', () => {
    const valid = plainToInstance(ListTaskQueryDto, {
      overdue: 'true',
      q: ' batch ',
    });
    const invalidBoolean = plainToInstance(ListTaskQueryDto, {
      overdue: 'yes',
    });
    const emptySearch = plainToInstance(ListTaskQueryDto, {
      q: '   ',
    });
    const longSearch = plainToInstance(ListTaskQueryDto, {
      q: 'a'.repeat(101),
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(valid.overdue).toBe(true);
    expect(valid.q).toBe('batch');
    expect(validateSync(invalidBoolean)).toHaveLength(1);
    expect(validateSync(emptySearch)).toHaveLength(1);
    expect(validateSync(longSearch)).toHaveLength(1);
  });

  it('validates fixed enum filters and non-empty IDs', () => {
    const valid = plainToInstance(ListTaskQueryDto, {
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.URGENT,
      teamId: 'team-a',
      responsibleUserId: 'member-a',
      sort: TaskSort.DUE_AT_ASC,
    });
    const invalid = plainToInstance(ListTaskQueryDto, {
      status: 'DONE',
      priority: 'VERY_HIGH',
      teamId: '',
      responsibleUserId: '',
      sort: 'DUE_SOON',
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid)).toHaveLength(5);
  });
});

describe('CreateTaskDto distribution validation', () => {
  it('requires notifyAll to be true and validates the lead range', () => {
    const valid = plainToInstance(CreateTaskDto, {
      title: 'Global recurring task',
      scope: TaskScope.GLOBAL,
      distribution: { notifyAll: true, leadMinutes: 1_440 },
    });
    const disabled = plainToInstance(CreateTaskDto, {
      title: 'Global task',
      scope: TaskScope.GLOBAL,
      distribution: { notifyAll: false },
    });
    const excessiveLead = plainToInstance(CreateTaskDto, {
      title: 'Global task',
      scope: TaskScope.GLOBAL,
      distribution: { notifyAll: true, leadMinutes: 10_081 },
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(disabled)).not.toHaveLength(0);
    expect(validateSync(excessiveLead)).not.toHaveLength(0);
  });
});

describe('TaskService', () => {
  it('rejects Member task creation', async () => {
    const service = createTaskService({} as PrismaService);

    try {
      await service.createTask(createViewer(UserRole.MEMBER), {
        title: 'Task',
        teamId: 'team-a',
      });
      throw new Error('Expected task creation to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      });
    }
  });

  it('rejects GLOBAL creation by an Admin before database access', async () => {
    const prisma = { $transaction: jestApi.fn() };
    const service = createTaskService(prisma as unknown as PrismaService);

    try {
      await service.createTask(createViewer(UserRole.ADMIN), {
        title: 'Organization notice',
        scope: TaskScope.GLOBAL,
      });
      throw new Error('Expected GLOBAL creation to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects REVIEW_REQUIRED and Team identity for GLOBAL tasks', async () => {
    const prisma = { $transaction: jestApi.fn() };
    const service = createTaskService(prisma as unknown as PrismaService);
    const chief = createViewer(UserRole.SUPER_ADMIN);

    try {
      await service.createTask(chief, {
        title: 'Reviewed global work',
        scope: TaskScope.GLOBAL,
        completionMode: TaskCompletionMode.REVIEW_REQUIRED,
      });
      throw new Error('Expected reviewed GLOBAL creation to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.BAD_REQUEST,
        code: TASK_ERROR_CODE.INVALID_TASK_SCOPE,
      });
    }
    try {
      await service.createTask(chief, {
        title: 'Global with Team',
        scope: TaskScope.GLOBAL,
        teamId: 'team-public',
      });
      throw new Error('Expected GLOBAL Team identity to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.BAD_REQUEST,
        code: TASK_ERROR_CODE.INVALID_TASK_SCOPE,
      });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an unassigned immediate GLOBAL distribution independently', async () => {
    const task = createTask({
      scope: TaskScope.GLOBAL,
      team: null,
      completionMode: TaskCompletionMode.DIRECT,
      distribution: {
        status: TaskDistributionStatus.PENDING,
        scheduledAt: fixedDate,
        sentAt: null,
      },
    });
    const tx = {
      task: {
        create: jestApi.fn().mockResolvedValue(task),
        findFirst: jestApi.fn().mockResolvedValue(task),
      },
      taskDistribution: {
        create: jestApi.fn().mockResolvedValue({ id: 'distribution-db' }),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const processDistribution = jestApi.fn().mockResolvedValue({
      state: 'sent',
      recipients: 3,
    });
    const service = new TaskService(
      prisma,
      { sendTaskAssignedEmail: jestApi.fn() } as never,
      undefined,
      { processDistribution } as never,
    );

    const result = await service.createTask(
      createViewer(UserRole.SUPER_ADMIN),
      {
        title: 'Organization notice',
        scope: TaskScope.GLOBAL,
        distribution: { notifyAll: true },
      },
    );

    expect(result.scope).toBe(TaskScope.GLOBAL);
    expect(result.team).toBeNull();
    expect(tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: TaskScope.GLOBAL,
        teamId: null,
        status: TaskStatus.PENDING,
        completionMode: TaskCompletionMode.DIRECT,
      }) as Record<string, unknown>,
      select: expect.any(Object) as object,
    });
    expect(tx.taskDistribution.create).toHaveBeenCalledTimes(1);
    expect(processDistribution).toHaveBeenCalledWith(
      'distribution-db',
      expect.any(Date),
    );
  });

  it('uses the submitted recurring GLOBAL Task as the single first occurrence', async () => {
    const dueAt = new Date('2099-09-25T11:00:00.000Z');
    const selected = createTask({
      scope: TaskScope.GLOBAL,
      team: null,
      status: TaskStatus.ASSIGNED,
      completionMode: TaskCompletionMode.DIRECT,
      dueAt,
      occurrenceKey: '2099-09-25',
      recurrence: {
        id: '44444444-4444-4444-8444-444444444444',
        frequency: 'MONTHLY',
        nextOccurrenceAt: new Date('2099-10-25T11:00:00.000Z'),
        reminderLeadMinutes: 1_440,
        isActive: true,
      },
      distribution: {
        status: TaskDistributionStatus.PENDING,
        scheduledAt: new Date('2099-09-24T11:00:00.000Z'),
        sentAt: null,
      },
    });
    const tx = {
      taskRecurrence: {
        create: jestApi.fn().mockResolvedValue({ id: 'recurrence-db' }),
      },
      task: {
        create: jestApi.fn().mockResolvedValue(selected),
        findFirst: jestApi.fn().mockResolvedValue(selected),
      },
      taskAssignment: {
        create: jestApi.fn().mockResolvedValue({ id: 'assignment-db' }),
      },
      taskReminder: {
        create: jestApi.fn().mockResolvedValue({ id: 'reminder-db' }),
      },
      taskDistribution: {
        create: jestApi.fn().mockResolvedValue({ id: 'distribution-db' }),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-db' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
      },
      notification: {
        create: jestApi.fn().mockResolvedValue({ id: 'notification-db' }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'responsible-db',
          name: 'Responsible User',
          email: 'responsible@example.com',
        }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma);

    await service.createTask(createViewer(UserRole.SUPER_ADMIN), {
      title: 'Publish monthly status',
      scope: TaskScope.GLOBAL,
      dueAt,
      responsibleUserId: '44444444-4444-4444-8444-444444444444',
      recurrence: { frequency: 'MONTHLY' },
      distribution: { notifyAll: true, leadMinutes: 1_440 },
    });

    expect(tx.taskRecurrence.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.taskDistribution.create).toHaveBeenCalledTimes(1);
    expect(tx.taskReminder.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recurrenceId: 'recurrence-db',
        occurrenceKey: '2099-09-25',
        scope: TaskScope.GLOBAL,
        teamId: null,
      }) as Record<string, unknown>,
      select: expect.any(Object) as object,
    });
    expect(tx.taskDistribution.create).toHaveBeenCalledWith({
      data: {
        taskId: selected.id,
        scheduledAt: new Date('2099-09-24T11:00:00.000Z'),
      },
      select: { id: true },
    });
  });

  it('creates a pending task with status history and activity', async () => {
    const task = createTask();
    const tx = {
      team: {
        findFirst: jestApi.fn().mockResolvedValue({ id: 'team-a' }),
      },
      task: {
        create: jestApi.fn().mockResolvedValue(task),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    await expect(
      service.createTask(createViewer(UserRole.ADMIN), {
        title: 'Prepare batch report',
        teamId: 'team-a',
      }),
    ).resolves.toEqual(task);

    expect(tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Prepare batch report',
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        teamId: 'team-a',
        createdById: 'admin-a',
        allowSelfClaim: false,
      }) as Record<string, unknown>,
      select: expect.any(Object) as object,
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        fromStatus: null,
        toStatus: TaskStatus.PENDING,
        changedById: 'admin-a',
        notes: 'Task created.',
      },
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: TASK_ACTIVITY.TASK_CREATED,
        actorId: 'admin-a',
        entityId: 'task-a',
      }) as Record<string, unknown>,
    });
  });

  it('returns TASK_NOT_FOUND when a globally visible task does not exist', async () => {
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    try {
      await service.getTask(createViewer(UserRole.ADMIN), 'task-b');
      throw new Error('Expected lookup to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.NOT_FOUND,
        code: TASK_ERROR_CODE.TASK_NOT_FOUND,
      });
    }
  });

  it('lists tasks with filters and maps isOverdue', async () => {
    const overdueTask = createTask({
      dueAt: new Date('2026-08-19T10:00:00.000Z'),
      status: TaskStatus.IN_PROGRESS,
    });
    const prisma = {
      task: {
        findMany: jestApi.fn().mockResolvedValue([overdueTask]),
        count: jestApi.fn().mockResolvedValue(1),
      },
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    await expect(
      service.listTasks(createViewer(UserRole.ADMIN), {
        status: TaskStatus.IN_PROGRESS,
        responsibleUserId: 'member-a',
        overdue: true,
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual({
      data: [
        {
          ...overdueTask,
          isOverdue: true,
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array) as unknown[],
        }) as Record<string, unknown>,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
      }) as Record<string, unknown>,
    );
  });

  it('returns task detail with isOverdue', async () => {
    const overdueTask = createTask({
      dueAt: new Date('2026-08-19T10:00:00.000Z'),
      status: TaskStatus.SUBMITTED,
    });
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue(overdueTask),
      },
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    await expect(
      service.getTask(createViewer(UserRole.ADMIN), 'task-a'),
    ).resolves.toEqual({
      ...overdueTask,
      isOverdue: true,
    });
  });

  it('returns globally visible paginated status history', async () => {
    const history = {
      fromStatus: TaskStatus.SUBMITTED,
      toStatus: TaskStatus.UNDER_REVIEW,
      changedBy: { publicId: 'admin-a', name: 'Admin A' },
      notes: 'Task review started.',
      changedAt: fixedDate,
    };
    const prisma = {
      task: {
        findFirst: jestApi
          .fn()
          .mockResolvedValue({ id: 'task-a-db', publicId: 'task-a' }),
      },
      taskStatusHistory: {
        findMany: jestApi.fn().mockResolvedValue([history]),
        count: jestApi.fn().mockResolvedValue(1),
      },
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    await expect(
      service.getTaskHistory(createViewer(UserRole.ADMIN), 'task-a', {
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual({
      data: [
        {
          taskId: 'task-a',
          fromStatus: history.fromStatus,
          toStatus: history.toStatus,
          changedBy: { id: 'admin-a', name: 'Admin A' },
          notes: history.notes,
          changedAt: history.changedAt,
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        publicId: 'task-a',
      },
      select: {
        id: true,
        publicId: true,
      },
    });
    expect(prisma.taskStatusHistory.findMany).toHaveBeenCalledWith({
      where: {
        taskId: 'task-a-db',
      },
      select: {
        fromStatus: true,
        toStatus: true,
        changedBy: { select: { publicId: true, name: true } },
        notes: true,
        changedAt: true,
      },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
  });

  it('returns task not found when globally visible history does not exist', async () => {
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    try {
      await service.getTaskHistory(createViewer(UserRole.ADMIN), 'task-b', {});
      throw new Error('Expected history lookup to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.NOT_FOUND,
        code: TASK_ERROR_CODE.TASK_NOT_FOUND,
      });
    }
  });

  it('rejects assignment when the responsible user is not eligible', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          publicId: 'task-a',
          referenceCode: 'TASK-20260820-ABC123',
          title: 'Prepare batch report',
          priority: TaskPriority.MEDIUM,
          dueAt: null,
          createdById: 'admin-a',
          completionMode: 'REVIEW_REQUIRED',
          status: TaskStatus.PENDING,
          teamId: 'team-a',
        }),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    try {
      await service.assignTask(createViewer(UserRole.ADMIN), 'task-a', {
        responsibleUserId: 'member-a',
      });
      throw new Error('Expected assignment to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: TASK_ERROR_CODE.RESPONSIBLE_USER_NOT_ELIGIBLE,
      });
    }
  });

  it('assigns a pending Task with status history, activity, notification, and post-commit email', async () => {
    const updatedTask = createTask({ status: TaskStatus.ASSIGNED });
    const mailService = {
      sendTaskAssignedEmail: jestApi.fn().mockResolvedValue(undefined),
    };
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          publicId: 'task-a',
          referenceCode: updatedTask.referenceCode,
          title: updatedTask.title,
          priority: updatedTask.priority,
          dueAt: updatedTask.dueAt,
          createdById: 'admin-a',
          completionMode: 'REVIEW_REQUIRED',
          status: TaskStatus.PENDING,
          teamId: 'team-a',
        }),
        update: jestApi.fn().mockResolvedValue(updatedTask),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi.fn().mockResolvedValue({ id: 'assignment-a' }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          name: 'Member A',
          email: 'member@example.com',
        }),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
      notification: {
        create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createTaskService(
      prisma as unknown as PrismaService,
      mailService,
    );

    await expect(
      service.assignTask(createViewer(UserRole.ADMIN), 'task-a', {
        responsibleUserId: 'member-a',
        note: 'Please start today.',
      }),
    ).resolves.toEqual(updatedTask);

    expect(tx.taskAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        responsibleUserId: 'member-a',
        assignedById: 'admin-a',
        note: 'Please start today.',
      },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        fromStatus: TaskStatus.PENDING,
        toStatus: TaskStatus.ASSIGNED,
        changedById: 'admin-a',
        notes: 'Task assigned.',
      },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        receiverId: 'member-a',
        actorId: 'admin-a',
        type: TASK_NOTIFICATION.TASK_ASSIGNED,
        title: 'New task assigned',
        body: 'A new task has been assigned to you.',
        targetType: 'TASK',
        targetId: 'task-a',
      },
    });
    expect(mailService.sendTaskAssignedEmail).toHaveBeenCalledWith({
      responsibleUserId: 'member-a',
      responsibleName: 'Member A',
      responsibleEmail: 'member@example.com',
      taskId: 'task-a',
      referenceCode: updatedTask.referenceCode,
      title: updatedTask.title,
      priority: updatedTask.priority,
      dueAt: updatedTask.dueAt,
      assignmentNote: 'Please start today.',
    });
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          email: true,
        },
      }) as Record<string, unknown>,
    );
  });

  it('does not map SMTP failure through assignment conflict handling', async () => {
    const updatedTask = createTask({ status: TaskStatus.ASSIGNED });
    const mailService = {
      sendTaskAssignedEmail: jestApi
        .fn()
        .mockRejectedValue(new Error('SMTP unavailable')),
    };
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          publicId: 'task-a',
          referenceCode: updatedTask.referenceCode,
          title: updatedTask.title,
          priority: updatedTask.priority,
          dueAt: updatedTask.dueAt,
          createdById: 'admin-a',
          completionMode: 'REVIEW_REQUIRED',
          status: TaskStatus.PENDING,
          teamId: 'team-a',
        }),
        update: jestApi.fn().mockResolvedValue(updatedTask),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi.fn().mockResolvedValue({ id: 'assignment-a' }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          name: 'Member A',
          email: 'member@example.com',
        }),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
      notification: {
        create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createTaskService(
      prisma as unknown as PrismaService,
      mailService,
    );

    await expect(
      service.assignTask(createViewer(UserRole.ADMIN), 'task-a', {
        responsibleUserId: 'member-a',
      }),
    ).resolves.toEqual(updatedTask);

    expect(mailService.sendTaskAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it('starts an assigned Task for the current assignee', async () => {
    const startedTask = createTask({
      status: TaskStatus.IN_PROGRESS,
      startedAt: fixedDate,
    });
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.ASSIGNED,
        }),
        update: jestApi.fn().mockResolvedValue(startedTask),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'assignment-a',
          responsibleUserId: 'member-a',
        }),
      },
      taskStatusHistory: {
        create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createTaskService(prisma as unknown as PrismaService);

    await expect(
      service.startTask(createViewer(UserRole.MEMBER), 'task-a'),
    ).resolves.toEqual(startedTask);

    expect(tx.task.update).toHaveBeenCalledWith({
      where: {
        id: 'task-a',
      },
      data: {
        status: TaskStatus.IN_PROGRESS,
        startedAt: expect.any(Date) as Date,
      },
      select: expect.any(Object) as object,
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        fromStatus: TaskStatus.ASSIGNED,
        toStatus: TaskStatus.IN_PROGRESS,
        changedById: 'member-a',
        notes: 'Task started.',
      },
    });
  });
});

describe('task query helpers', () => {
  it('composes filters with viewer scope using AND', () => {
    const where = buildTaskListWhere(
      createViewer(UserRole.MEMBER),
      {
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        responsibleUserId: undefined,
        overdue: true,
        q: 'batch',
      },
      fixedDate,
    );

    expect(where).toEqual({
      AND: [
        {
          status: TaskStatus.IN_PROGRESS,
        },
        {
          priority: TaskPriority.URGENT,
        },
        {
          dueAt: {
            lt: fixedDate,
          },
          status: {
            notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
          },
        },
        {
          OR: [
            {
              referenceCode: {
                contains: 'batch',
                mode: 'insensitive',
              },
            },
            {
              title: {
                contains: 'batch',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'batch',
                mode: 'insensitive',
              },
            },
          ],
        },
      ],
    });
  });

  it('allows global visibility filters for every authenticated role', () => {
    expect(
      buildTaskListWhere(
        createViewer(UserRole.ADMIN),
        { teamId: 'team-b' },
        fixedDate,
      ),
    ).toEqual({
      AND: [{ scope: TaskScope.TEAM }, { team: { publicId: 'team-b' } }],
    });

    expect(
      buildTaskListWhere(
        createViewer(UserRole.MEMBER),
        { responsibleUserId: 'member-b' },
        fixedDate,
      ),
    ).toEqual({
      AND: [
        {
          assignments: {
            some: {
              responsibleUser: { publicId: 'member-b' },
              unassignedAt: null,
            },
          },
        },
      ],
    });
  });

  it('uses current responsibility and exact overdue false complement', () => {
    const where = buildTaskListWhere(
      createViewer(UserRole.ADMIN),
      {
        responsibleUserId: 'member-b',
        overdue: false,
      },
      fixedDate,
    );

    expect(where).toEqual({
      AND: [
        {
          assignments: {
            some: {
              responsibleUser: { publicId: 'member-b' },
              unassignedAt: null,
            },
          },
        },
        {
          OR: [
            {
              dueAt: null,
            },
            {
              dueAt: {
                gte: fixedDate,
              },
            },
            {
              status: {
                in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
              },
            },
          ],
        },
      ],
    });
  });

  it('returns deterministic task orderings', () => {
    expect(getTaskOrderBy()).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(getTaskOrderBy(TaskSort.CREATED_AT_ASC)).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(getTaskOrderBy(TaskSort.DUE_AT_ASC)).toEqual([
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
    expect(getTaskOrderBy(TaskSort.DUE_AT_DESC)).toEqual([
      { dueAt: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
    expect(getTaskOrderBy(TaskSort.PRIORITY_DESC)).toEqual([
      { priority: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(getTaskOrderBy(TaskSort.PRIORITY_ASC)).toEqual([
      { priority: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('TaskService self claim', () => {
  it('rejects self claim creation combined with responsibility or recurrence', async () => {
    const transaction = jestApi.fn();
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = createTaskService(prisma);
    const viewer = createViewer(UserRole.ADMIN);

    await expect(
      service.createTask(viewer, {
        title: 'Claimable task',
        teamId: 'team-a',
        responsibleUserId: 'member-a',
        allowSelfClaim: true,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: APP_ERROR_CODE.VALIDATION_ERROR },
    });
    await expect(
      service.createTask(viewer, {
        title: 'Recurring claimable task',
        teamId: 'team-a',
        dueAt: new Date('2099-09-25T11:00:00.000Z'),
        recurrence: { frequency: 'MONTHLY' },
        allowSelfClaim: true,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('allows the Owner to enable self claim on a pending unassigned task', async () => {
    const updated = createTask({ allowSelfClaim: true });
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.PENDING,
          createdById: 'admin-a',
          recurrenceId: null,
          allowSelfClaim: false,
        }),
        update: jestApi.fn().mockResolvedValue(updated),
      },
      taskAssignment: { findFirst: jestApi.fn().mockResolvedValue(null) },
      activityLog: { create: jestApi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma);

    await expect(
      service.updateSelfClaim(createViewer(UserRole.ADMIN), 'task-a', true),
    ).resolves.toEqual(updated);
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-a' },
      data: { allowSelfClaim: true },
      select: expect.any(Object) as object,
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: TASK_ACTIVITY.TASK_SELF_CLAIM_ENABLED,
        actorId: 'admin-a',
        entityId: 'task-a',
      }) as Record<string, unknown>,
    });
  });

  it('returns an unchanged task without writing when the self claim setting is already correct', async () => {
    const unchanged = createTask({ allowSelfClaim: true });
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.PENDING,
          createdById: 'admin-a',
          recurrenceId: null,
          allowSelfClaim: true,
        }),
        findUnique: jestApi.fn().mockResolvedValue(unchanged),
        update: jestApi.fn(),
      },
      taskAssignment: { findFirst: jestApi.fn().mockResolvedValue(null) },
      activityLog: { create: jestApi.fn() },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma);

    await expect(
      service.updateSelfClaim(createViewer(UserRole.ADMIN), 'task-a', true),
    ).resolves.toEqual(unchanged);
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it('rejects enabling self claim for a recurring task', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.PENDING,
          createdById: 'admin-a',
          recurrenceId: 'recurrence-a',
          allowSelfClaim: false,
        }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma);

    await expect(
      service.updateSelfClaim(createViewer(UserRole.ADMIN), 'task-a', true),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: TASK_ERROR_CODE.TASK_SELF_CLAIM_NOT_ALLOWED_FOR_RECURRING_TASK,
      },
    });
  });

  it('claims a cross Team task and returns the canonical assigned task', async () => {
    let assignmentAssignedAt: Date | undefined;
    let historyChangedAt: Date | undefined;
    const responsible = {
      id: 'member-a',
      name: 'Member A',
      role: UserRole.MEMBER,
      employeeId: 'EMP-1',
      designation: 'Officer',
    };
    const updated = createTask({
      status: TaskStatus.ASSIGNED,
      allowSelfClaim: true,
      responsible,
    });
    const mailService = {
      sendTaskAssignedEmail: jestApi.fn().mockResolvedValue(undefined),
    };
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          publicId: 'task-a',
          referenceCode: updated.referenceCode,
          title: updated.title,
          priority: updated.priority,
          dueAt: updated.dueAt,
          status: TaskStatus.PENDING,
          allowSelfClaim: true,
          recurrenceId: null,
          createdById: 'admin-a',
        }),
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
        findUnique: jestApi.fn().mockResolvedValue(updated),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi.fn((input: { data: { assignedAt: Date } }) => {
          assignmentAssignedAt = input.data.assignedAt;
          return Promise.resolve({ id: 'assignment-a' });
        }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          name: 'Member A',
          email: 'member@example.com',
        }),
      },
      taskStatusHistory: {
        create: jestApi.fn((input: { data: { changedAt: Date } }) => {
          historyChangedAt = input.data.changedAt;
          return Promise.resolve({});
        }),
      },
      activityLog: { create: jestApi.fn().mockResolvedValue({}) },
      notification: { create: jestApi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma, mailService);

    await expect(
      service.claimTask(createViewer(UserRole.MEMBER), 'task-a'),
    ).resolves.toEqual(updated);
    expect(assignmentAssignedAt).toBeInstanceOf(Date);
    expect(assignmentAssignedAt).toBe(historyChangedAt);
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-a', status: TaskStatus.PENDING },
      data: { status: TaskStatus.ASSIGNED },
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        receiverId: 'member-a',
        type: TASK_NOTIFICATION.TASK_ASSIGNED,
      }) as Record<string, unknown>,
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        receiverId: 'admin-a',
        type: TASK_NOTIFICATION.TASK_CLAIMED,
      }) as Record<string, unknown>,
    });
    expect(mailService.sendTaskAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it('returns a safe claim conflict when the conditional status transition loses', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          publicId: 'task-a',
          referenceCode: 'TASK-1',
          title: 'Claim me',
          priority: TaskPriority.MEDIUM,
          dueAt: null,
          status: TaskStatus.PENDING,
          allowSelfClaim: true,
          recurrenceId: null,
          createdById: 'admin-a',
        }),
        updateMany: jestApi.fn().mockResolvedValue({ count: 0 }),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi.fn().mockResolvedValue({ id: 'assignment-a' }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          name: 'Member A',
          email: 'member@example.com',
        }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createTaskService(prisma);

    await expect(
      service.claimTask(createViewer(UserRole.MEMBER), 'task-a'),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_CLAIM_CONFLICT },
    });
  });

  it.each([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER])(
    'keeps an unassigned pending task visible to %s',
    async (role) => {
      const task = createTask({
        status: TaskStatus.PENDING,
        responsible: null,
      });
      const prisma = {
        task: { findFirst: jestApi.fn().mockResolvedValue(task) },
      } as unknown as PrismaService;
      const service = createTaskService(prisma);

      await expect(
        service.getTask(createViewer(role), 'task-a'),
      ).resolves.toEqual(task);
    },
  );
});

describe('task response mapper', () => {
  it.each([
    TaskStatus.PENDING,
    TaskStatus.ASSIGNED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.SUBMITTED,
    TaskStatus.UNDER_REVIEW,
    TaskStatus.REVISION_REQUIRED,
    TaskStatus.RESUBMITTED,
  ])('marks past due active status %s as overdue', (status) => {
    expect(
      isTaskOverdue(
        {
          dueAt: new Date('2026-08-19T10:00:00.000Z'),
          status,
        },
        fixedDate,
      ),
    ).toBe(true);
  });

  it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED])(
    'does not mark terminal status %s as overdue',
    (status) => {
      expect(
        isTaskOverdue(
          {
            dueAt: new Date('2026-08-19T10:00:00.000Z'),
            status,
          },
          fixedDate,
        ),
      ).toBe(false);
    },
  );

  it('does not mark future or null due dates as overdue', () => {
    expect(
      isTaskOverdue(
        {
          dueAt: new Date('2026-08-21T10:00:00.000Z'),
          status: TaskStatus.IN_PROGRESS,
        },
        fixedDate,
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        {
          dueAt: null,
          status: TaskStatus.IN_PROGRESS,
        },
        fixedDate,
      ),
    ).toBe(false);
  });
});
