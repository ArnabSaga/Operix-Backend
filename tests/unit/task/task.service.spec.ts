import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  TaskPriority,
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
import { buildTaskScopeWhere } from '../../../src/modules/task/policies/task-scope.policy';
import type { SafeTaskResponse } from '../../../src/modules/task/task.interface';
import { isTaskOverdue } from '../../../src/modules/task/task.mapper';
import {
  buildTaskListWhere,
  getTaskOrderBy,
} from '../../../src/modules/task/task-query';
import { TaskService } from '../../../src/modules/task/task.service';
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
  Object.defineProperties(task, {
    publicId: { value: task.id, enumerable: false },
    team: { value: { publicId: task.teamId }, enumerable: false },
    category: {
      value: task.categoryId ? { publicId: task.categoryId } : null,
      enumerable: false,
    },
    createdBy: { value: { publicId: task.createdById }, enumerable: false },
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
    dueAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    teamId: 'team-a',
    categoryId: null,
    createdById: 'admin-a',
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
          memberId: 'member-a',
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
      assignedMemberId: 'member-a',
      sort: TaskSort.DUE_AT_ASC,
    });
    const invalid = plainToInstance(ListTaskQueryDto, {
      status: 'DONE',
      priority: 'VERY_HIGH',
      teamId: '',
      assignedMemberId: '',
      sort: 'DUE_SOON',
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid)).toHaveLength(5);
  });
});

describe('TaskService', () => {
  it('rejects Super Admin task creation for V1', async () => {
    const service = createTaskService({} as PrismaService);

    try {
      await service.createTask(createViewer(UserRole.SUPER_ADMIN), {
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

  it('returns privacy safe TASK_NOT_FOUND outside Admin scope', async () => {
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
        assignedMemberId: 'member-a',
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

  it('returns paginated status history after scoped task lookup', async () => {
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
        AND: [
          {
            teamId: {
              in: ['team-a'],
            },
          },
        ],
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

  it('returns task not found for out-of-scope history', async () => {
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

  it('rejects assignment when the Member is not eligible for the Task Team', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
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
        memberId: 'member-a',
      });
      throw new Error('Expected assignment to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: TASK_ERROR_CODE.MEMBER_NOT_ELIGIBLE_FOR_TASK,
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
        memberId: 'member-a',
        note: 'Please start today.',
      }),
    ).resolves.toEqual(updatedTask);

    expect(tx.taskAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        memberId: 'member-a',
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
      memberId: 'member-a',
      memberName: 'Member A',
      memberEmail: 'member@example.com',
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
        memberId: 'member-a',
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
        assignedMemberId: undefined,
        overdue: true,
        q: 'batch',
      },
      fixedDate,
    );

    expect(where).toEqual({
      AND: [
        {
          assignments: {
            some: {
              memberId: 'member-a',
              unassignedAt: null,
            },
          },
        },
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

  it('blocks unauthorized query controls', () => {
    expect(() =>
      buildTaskListWhere(
        createViewer(UserRole.ADMIN),
        {
          teamId: 'team-b',
        },
        fixedDate,
      ),
    ).toThrow();

    expect(() =>
      buildTaskListWhere(
        createViewer(UserRole.MEMBER),
        {
          assignedMemberId: 'member-b',
        },
        fixedDate,
      ),
    ).toThrow();
  });

  it('uses current assignment for assignedMemberId and exact overdue false complement', () => {
    const where = buildTaskListWhere(
      createViewer(UserRole.ADMIN),
      {
        assignedMemberId: 'member-b',
        overdue: false,
      },
      fixedDate,
    );

    expect(where).toEqual({
      AND: [
        {
          teamId: {
            in: ['team-a'],
          },
        },
        {
          assignments: {
            some: {
              member: { publicId: 'member-b' },
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
