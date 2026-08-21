import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  SUBMISSION_ACTIVITY,
  SUBMISSION_ERROR_CODE,
  SUBMISSION_NOTIFICATION,
} from '../../../src/modules/submission/submission.constant';
import { buildSubmissionScopeWhere } from '../../../src/modules/submission/policies/submission-scope.policy';
import type { SafeSubmissionResponse } from '../../../src/modules/submission/submission.interface';
import { SubmissionService } from '../../../src/modules/submission/submission.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

const fixedDate = new Date('2026-08-21T10:00:00.000Z');

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

function createSubmission(
  overrides: Partial<SafeSubmissionResponse> = {},
): SafeSubmissionResponse {
  return {
    id: 'submission-a',
    taskId: 'task-a',
    submittedById: 'member-a',
    version: 1,
    submissionText: 'Completed assigned workload.',
    submittedAt: fixedDate,
    createdAt: fixedDate,
    ...overrides,
  };
}

function createKnownRequestError(code: string): Error {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
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

describe('submission scope policy', () => {
  it('scopes submission reads by viewer role', () => {
    expect(
      buildSubmissionScopeWhere(createViewer(UserRole.SUPER_ADMIN)),
    ).toEqual({});
    expect(buildSubmissionScopeWhere(createViewer(UserRole.ADMIN))).toEqual({
      task: {
        teamId: {
          in: ['team-a'],
        },
      },
    });
    expect(buildSubmissionScopeWhere(createViewer(UserRole.MEMBER))).toEqual({
      submittedById: 'member-a',
    });
  });
});

describe('SubmissionService', () => {
  it('creates first submission for current Member and keeps Task waiting for review', async () => {
    const submission = createSubmission();
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.IN_PROGRESS,
          team: {
            adminId: 'admin-a',
          },
        }),
        update: jestApi.fn().mockResolvedValue({ id: 'task-a' }),
      },
      taskSubmission: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi.fn().mockResolvedValue(submission),
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
    const service = new SubmissionService(prisma as unknown as PrismaService);

    await expect(
      service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Completed assigned workload.',
      }),
    ).resolves.toBe(submission);

    expect(tx.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-a',
        assignments: {
          some: {
            memberId: 'member-a',
            unassignedAt: null,
          },
        },
      },
      select: expect.any(Object) as object,
    });
    expect(tx.taskSubmission.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        submittedById: 'member-a',
        version: 1,
        submissionText: 'Completed assigned workload.',
      },
      select: expect.any(Object) as object,
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: {
        id: 'task-a',
      },
      data: {
        status: TaskStatus.SUBMITTED,
      },
      select: {
        id: true,
      },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        fromStatus: TaskStatus.IN_PROGRESS,
        toStatus: TaskStatus.SUBMITTED,
        changedById: 'member-a',
        notes: 'Task submitted.',
      },
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: SUBMISSION_ACTIVITY.TASK_SUBMITTED,
        actorId: 'member-a',
        entityId: 'task-a',
        metadata: {
          taskId: 'task-a',
          submissionId: 'submission-a',
          version: 1,
        },
      }) as Record<string, unknown>,
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        receiverId: 'admin-a',
        actorId: 'member-a',
        type: SUBMISSION_NOTIFICATION.TASK_SUBMITTED,
        title: 'Task submitted',
        body: 'A task submission is ready for review.',
        targetType: 'SUBMISSION',
        targetId: 'submission-a',
      },
    });
  });

  it('returns TASK_NOT_FOUND when the current Member cannot access the Task', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    try {
      await service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Done.',
      });
      throw new Error('Expected submission to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.NOT_FOUND,
        code: TASK_ERROR_CODE.TASK_NOT_FOUND,
      });
    }
  });

  it('rejects submission from invalid Task states', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.SUBMITTED,
          team: {
            adminId: 'admin-a',
          },
        }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    try {
      await service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Done.',
      });
      throw new Error('Expected submission to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: SUBMISSION_ERROR_CODE.SUBMISSION_NOT_ALLOWED,
      });
    }
  });

  it('creates resubmission version 2 and preserves prior versions', async () => {
    const submission = createSubmission({
      id: 'submission-b',
      version: 2,
    });
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.REVISION_REQUIRED,
          team: {
            adminId: 'admin-a',
          },
        }),
        update: jestApi.fn().mockResolvedValue({ id: 'task-a' }),
      },
      taskSubmission: {
        findFirst: jestApi.fn().mockResolvedValue({ version: 1 }),
        create: jestApi.fn().mockResolvedValue(submission),
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
    const service = new SubmissionService(prisma as unknown as PrismaService);

    await expect(
      service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Revised workload.',
      }),
    ).resolves.toBe(submission);

    expect(tx.taskSubmission.findFirst).toHaveBeenCalledWith({
      where: {
        taskId: 'task-a',
      },
      orderBy: {
        version: 'desc',
      },
      select: {
        version: true,
      },
    });
    expect(tx.taskSubmission.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        submittedById: 'member-a',
        version: 2,
        submissionText: 'Revised workload.',
      },
      select: expect.any(Object) as object,
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: {
        id: 'task-a',
      },
      data: {
        status: TaskStatus.RESUBMITTED,
      },
      select: {
        id: true,
      },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-a',
        fromStatus: TaskStatus.REVISION_REQUIRED,
        toStatus: TaskStatus.RESUBMITTED,
        changedById: 'member-a',
        notes: 'Task resubmitted.',
      },
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: SUBMISSION_ACTIVITY.TASK_RESUBMITTED,
        metadata: {
          taskId: 'task-a',
          submissionId: 'submission-b',
          version: 2,
        },
      }) as Record<string, unknown>,
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: SUBMISSION_NOTIFICATION.TASK_RESUBMITTED,
        targetType: 'SUBMISSION',
        targetId: 'submission-b',
      }) as Record<string, unknown>,
    });
  });

  it('rejects resubmission when no previous submission exists', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.REVISION_REQUIRED,
          team: {
            adminId: 'admin-a',
          },
        }),
      },
      taskSubmission: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    try {
      await service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Revised.',
      });
      throw new Error('Expected resubmission to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: SUBMISSION_ERROR_CODE.SUBMISSION_NOT_ALLOWED,
      });
    }
  });

  it('maps submission version uniqueness races to CONCURRENT_MODIFICATION', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-a',
          status: TaskStatus.IN_PROGRESS,
          team: {
            adminId: 'admin-a',
          },
        }),
      },
      taskSubmission: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        create: jestApi
          .fn()
          .mockRejectedValue(createKnownRequestError('P2002')),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    try {
      await service.createSubmission(createViewer(UserRole.MEMBER), 'task-a', {
        submissionText: 'Done.',
      });
      throw new Error('Expected submission to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: APP_ERROR_CODE.CONCURRENT_MODIFICATION,
      });
    }
  });

  it('enforces Admin submission detail scope through Prisma where', async () => {
    const submission = createSubmission();
    const prisma = {
      taskSubmission: {
        findFirst: jestApi.fn().mockResolvedValue(submission),
      },
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    await expect(
      service.getSubmission(createViewer(UserRole.ADMIN), 'submission-a'),
    ).resolves.toBe(submission);

    expect(prisma.taskSubmission.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'submission-a',
        task: {
          teamId: {
            in: ['team-a'],
          },
        },
      },
      select: expect.any(Object) as object,
    });
  });

  it('lets Members read their own historical submissions but not another Member submission', async () => {
    const submission = createSubmission();
    const prisma = {
      taskSubmission: {
        findMany: jestApi.fn().mockResolvedValue([submission]),
        count: jestApi.fn().mockResolvedValue(1),
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = new SubmissionService(prisma as unknown as PrismaService);

    await expect(
      service.listTaskSubmissions(createViewer(UserRole.MEMBER), 'task-a', {}),
    ).resolves.toEqual({
      data: [submission],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    expect(prisma.taskSubmission.findMany).toHaveBeenCalledWith({
      where: {
        taskId: 'task-a',
        submittedById: 'member-a',
      },
      select: expect.any(Object) as object,
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });

    try {
      await service.getSubmission(
        createViewer(UserRole.MEMBER),
        'submission-b',
      );
      throw new Error('Expected submission lookup to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.NOT_FOUND,
        code: SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
      });
    }
  });
});
