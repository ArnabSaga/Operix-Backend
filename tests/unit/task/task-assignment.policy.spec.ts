import { HttpStatus } from '@nestjs/common';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { resolveAssignableTask } from '../../../src/modules/task/policies/task-assignment.policy';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

function viewer(role: UserRole, userId = 'admin-a'): OperixViewer {
  return {
    userId,
    role,
    status: UserStatus.ACTIVE,
    scope: { type: 'GLOBAL' },
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-db',
    publicId: '10000000-0000-4000-8000-000000000001',
    referenceCode: 'TASK-1',
    title: 'Task',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    dueAt: null,
    status: TaskStatus.PENDING,
    scope: TaskScope.TEAM,
    createdById: 'admin-a',
    completionMode: TaskCompletionMode.REVIEW_REQUIRED,
    team: { name: 'Quality' },
    category: null,
    assignments: [],
    ...overrides,
  };
}

function client(result: unknown) {
  return {
    task: { findFirst: jestApi.fn().mockResolvedValue(result) },
  } as never;
}

describe('resolveAssignableTask', () => {
  it('allows Super Admin and the owner Admin', async () => {
    await expect(
      resolveAssignableTask(client(task()), viewer(UserRole.SUPER_ADMIN), 'id'),
    ).resolves.toMatchObject({ id: 'task-db' });
    await expect(
      resolveAssignableTask(client(task()), viewer(UserRole.ADMIN), 'id'),
    ).resolves.toMatchObject({ id: 'task-db' });
  });

  it('denies unrelated Admin and Member even if fixture creator matches', async () => {
    await expect(
      resolveAssignableTask(
        client(task()),
        viewer(UserRole.ADMIN, 'admin-b'),
        'id',
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });
    await expect(
      resolveAssignableTask(client(task()), viewer(UserRole.MEMBER), 'id'),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: APP_ERROR_CODE.FORBIDDEN },
    });
  });

  it('preserves missing then authority then status error order', async () => {
    await expect(
      resolveAssignableTask(client(null), viewer(UserRole.ADMIN), 'id'),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { code: TASK_ERROR_CODE.TASK_NOT_FOUND },
    });
    await expect(
      resolveAssignableTask(
        client(task({ status: TaskStatus.IN_PROGRESS })),
        viewer(UserRole.ADMIN, 'admin-b'),
        'id',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(
      resolveAssignableTask(
        client(task({ status: TaskStatus.IN_PROGRESS })),
        viewer(UserRole.ADMIN),
        'id',
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.INVALID_TASK_TRANSITION },
    });
  });
});
