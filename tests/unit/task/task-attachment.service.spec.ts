import { HttpStatus } from '@nestjs/common';
import {
  TaskDistributionStatus,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { TaskAttachmentService } from '../../../src/modules/task/task-attachment.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

function viewer(role: UserRole, userId: string): OperixViewer {
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

function createService(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const storage = {
    assertEnabled: jestApi.fn(),
    destroy: jestApi.fn(),
  };
  return {
    service: new TaskAttachmentService(prisma, storage as never),
    storage,
  };
}

describe('TaskAttachmentService mutation policy', () => {
  it('denies an unrelated Admin even when the Task is visible', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.ADMIN, 'other-admin-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(tx.taskAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('locks attachment mutation after a GLOBAL distribution was sent', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.SENT },
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.ADMIN, 'owner-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_ATTACHMENTS_NOT_EDITABLE },
    });
    expect(tx.taskAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('allows a Super Admin to mutate an unstarted assigned Task', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.CANCELLED },
        }),
        findUnique: jestApi.fn().mockResolvedValue({
          publicId: '11111111-1111-4111-8111-111111111111',
        }),
      },
      taskAttachment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'attachment-db',
          publicId: '22222222-2222-4222-8222-222222222222',
          fileId: 'file-db',
          file: {
            publicId: '33333333-3333-4333-8333-333333333333',
            storageKey: 'private/storage-key',
          },
        }),
        count: jestApi.fn().mockResolvedValue(1),
        delete: jestApi.fn().mockResolvedValue({}),
      },
      submissionAttachment: { count: jestApi.fn().mockResolvedValue(0) },
      fileAsset: { delete: jestApi.fn().mockResolvedValue({}) },
      activityLog: { create: jestApi.fn().mockResolvedValue({}) },
    };
    const { service, storage } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.SUPER_ADMIN, 'chief-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toEqual({ id: '22222222-2222-4222-8222-222222222222' });
    expect(storage.destroy).toHaveBeenCalledWith('private/storage-key');
  });
});

describe('TaskAttachmentService artifact reads', () => {
  it('includes GLOBAL Tasks in a Member artifact query', async () => {
    const findTask = jestApi.fn().mockResolvedValue({ id: 'task-db' });
    const prisma = {
      task: {
        findFirst: findTask,
      },
      taskAttachment: { findMany: jestApi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new TaskAttachmentService(prisma, {} as never);

    await service.listTaskAttachments(
      viewer(UserRole.MEMBER, 'member-db'),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(findTask).toHaveBeenCalledWith({
      where: {
        publicId: '11111111-1111-4111-8111-111111111111',
        AND: [
          {
            OR: [
              { scope: TaskScope.GLOBAL },
              {
                scope: TaskScope.TEAM,
                AND: [
                  {
                    assignments: {
                      some: {
                        responsibleUserId: 'member-db',
                        unassignedAt: null,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      select: { id: true },
    });
  });
});
