import { HttpStatus } from '@nestjs/common';
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
} from '../../../src/modules/task/task.constant';
import { buildTaskScopeWhere } from '../../../src/modules/task/policies/task-scope.policy';
import type { SafeTaskResponse } from '../../../src/modules/task/task.interface';
import { TaskService } from '../../../src/modules/task/task.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

const fixedDate = new Date('2026-08-20T10:00:00.000Z');

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
  return {
    ...baseTask(),
    ...overrides,
  };
}

function baseTask(): SafeTaskResponse {
  return {
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
  };
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
      team: {
        adminId: 'admin-a',
      },
    });
    expect(buildTaskScopeWhere(createViewer(UserRole.MEMBER))).toEqual({
      assignments: {
        some: {
          memberId: 'member-a',
        },
      },
    });
  });
});

describe('TaskService', () => {
  it('rejects Super Admin task creation for V1', async () => {
    const service = new TaskService({} as PrismaService);

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
      team: {
        findFirst: jestApi.fn().mockResolvedValue({ id: 'team-a' }),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new TaskService(prisma as unknown as PrismaService);

    await expect(
      service.createTask(createViewer(UserRole.ADMIN), {
        title: 'Prepare batch report',
        teamId: 'team-a',
      }),
    ).resolves.toBe(task);

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
    const service = new TaskService(prisma as unknown as PrismaService);

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

  it('rejects assignment when the Member is not eligible for the Task Team', async () => {
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.PENDING,
          teamId: 'team-a',
        }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = new TaskService(prisma as unknown as PrismaService);

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

  it('assigns a pending Task with status history, activity, and notification', async () => {
    const updatedTask = createTask({ status: TaskStatus.ASSIGNED });
    const tx = {
      taskAssignment: {
        create: jestApi.fn().mockResolvedValue({ id: 'assignment-a' }),
      },
      task: {
        update: jestApi.fn().mockResolvedValue(updatedTask),
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
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.PENDING,
          teamId: 'team-a',
        }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({ id: 'member-a' }),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new TaskService(prisma as unknown as PrismaService);

    await expect(
      service.assignTask(createViewer(UserRole.ADMIN), 'task-a', {
        memberId: 'member-a',
        note: 'Please start today.',
      }),
    ).resolves.toBe(updatedTask);

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
  });

  it('starts an assigned Task for the current assignee', async () => {
    const assignedTask = createTask({ status: TaskStatus.ASSIGNED });
    const startedTask = createTask({
      status: TaskStatus.IN_PROGRESS,
      startedAt: fixedDate,
    });
    const tx = {
      task: {
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
      task: {
        findFirst: jestApi.fn().mockResolvedValue(assignedTask),
      },
      taskAssignment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'assignment-a',
          memberId: 'member-a',
        }),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new TaskService(prisma as unknown as PrismaService);

    await expect(
      service.startTask(createViewer(UserRole.MEMBER), 'task-a'),
    ).resolves.toBe(startedTask);

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
