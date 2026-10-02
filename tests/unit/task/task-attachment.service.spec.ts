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
import {
  areTaskAttachmentsEditable,
  canMutateTaskAttachments,
  getTaskAttachmentMutationDecision,
} from '../../../src/modules/task/policies/task-attachment.policy';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

describe('canMutateTaskAttachments', () => {
  const baseTask = {
    createdById: 'owner-db',
    responsibleUserId: null,
    scope: TaskScope.TEAM,
    status: TaskStatus.PENDING,
    startedAt: null,
    distribution: null,
  };

  it('allows Super Admin, the Owner Admin, or the current Responsible Member', () => {
    expect(
      canMutateTaskAttachments(viewer(UserRole.ADMIN, 'owner-db'), baseTask),
    ).toBe(true);
    expect(
      canMutateTaskAttachments(
        viewer(UserRole.SUPER_ADMIN, 'chief-db'),
        baseTask,
      ),
    ).toBe(true);
    expect(
      canMutateTaskAttachments(
        viewer(UserRole.ADMIN, 'unrelated-admin'),
        baseTask,
      ),
    ).toBe(false);
    expect(
      canMutateTaskAttachments(viewer(UserRole.MEMBER, 'owner-db'), baseTask),
    ).toBe(false);
    expect(
      canMutateTaskAttachments(viewer(UserRole.MEMBER, 'member-db'), {
        ...baseTask,
        responsibleUserId: 'member-db',
      }),
    ).toBe(true);
    expect(
      canMutateTaskAttachments(viewer(UserRole.ADMIN, 'other-admin-db'), {
        ...baseTask,
        responsibleUserId: 'other-admin-db',
      }),
    ).toBe(false);
  });

  it('separates authority failures from lifecycle and broadcast locks', () => {
    expect(
      getTaskAttachmentMutationDecision(
        viewer(UserRole.ADMIN, 'unrelated-admin'),
        baseTask,
      ),
    ).toEqual({ allowed: false, reason: 'FORBIDDEN' });
    expect(
      getTaskAttachmentMutationDecision(viewer(UserRole.ADMIN, 'owner-db'), {
        ...baseTask,
        status: TaskStatus.IN_PROGRESS,
      }),
    ).toEqual({ allowed: false, reason: 'LOCKED' });
    expect(
      getTaskAttachmentMutationDecision(viewer(UserRole.ADMIN, 'owner-db'), {
        ...baseTask,
        distribution: { status: TaskDistributionStatus.SENT },
      }),
    ).toEqual({ allowed: false, reason: 'LOCKED' });
    expect(
      getTaskAttachmentMutationDecision(viewer(UserRole.MEMBER, 'member-db'), {
        ...baseTask,
        scope: TaskScope.GLOBAL,
        responsibleUserId: 'member-db',
        status: TaskStatus.ASSIGNED,
        distribution: { status: TaskDistributionStatus.SENT },
      }),
    ).toEqual({
      allowed: true,
      authority: 'RESPONSIBLE_MEMBER',
    });
    expect(
      getTaskAttachmentMutationDecision(viewer(UserRole.MEMBER, 'member-db'), {
        ...baseTask,
        responsibleUserId: 'member-db',
        status: TaskStatus.ASSIGNED,
        distribution: { status: TaskDistributionStatus.SENT },
      }),
    ).toEqual({ allowed: false, reason: 'LOCKED' });
  });

  it('treats pending and unstarted assigned Tasks as editable', () => {
    expect(areTaskAttachmentsEditable(baseTask)).toBe(true);
    expect(
      areTaskAttachmentsEditable({
        ...baseTask,
        status: TaskStatus.ASSIGNED,
      }),
    ).toBe(true);
    expect(
      areTaskAttachmentsEditable({
        ...baseTask,
        status: TaskStatus.ASSIGNED,
        startedAt: new Date('2026-09-28T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      areTaskAttachmentsEditable({
        ...baseTask,
        distribution: { status: TaskDistributionStatus.CANCELLED },
      }),
    ).toBe(true);
  });
});

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
  it('routes upload through the shared policy before file validation', async () => {
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [],
        }),
      },
    } as unknown as PrismaService;
    const storage = {
      validateFiles: jestApi.fn(),
    };
    const service = new TaskAttachmentService(prisma, storage as never);

    await expect(
      service.uploadTaskAttachments(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        [],
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(storage.validateFiles).not.toHaveBeenCalled();
  });

  it('allows the current Responsible Member to reach service-level upload validation', async () => {
    const validationError = new Error('validation reached');
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
    } as unknown as PrismaService;
    const storage = {
      validateFiles: jestApi.fn().mockRejectedValue(validationError),
    };
    const service = new TaskAttachmentService(prisma, storage as never);

    await expect(
      service.uploadTaskAttachments(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        [],
      ),
    ).rejects.toBe(validationError);
    expect(storage.validateFiles).toHaveBeenCalledTimes(1);
  });

  it('allows the current Responsible Member to upload on a sent GLOBAL Task before execution starts', async () => {
    const validationError = new Error('validation reached');
    const prisma = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.GLOBAL,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.SENT },
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
    } as unknown as PrismaService;
    const storage = {
      validateFiles: jestApi.fn().mockRejectedValue(validationError),
    };
    const service = new TaskAttachmentService(prisma, storage as never);

    await expect(
      service.uploadTaskAttachments(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        [],
      ),
    ).rejects.toBe(validationError);
    expect(storage.validateFiles).toHaveBeenCalledTimes(1);
  });

  it('denies an unrelated Admin even when the Task is visible', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [],
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

  it('denies a responsible non-owner Admin before delete lookup', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'other-admin-db' }],
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

  it('denies an unrelated Member before delete lookup', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'other-member-db' }],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(tx.taskAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('denies a Member even if the fixture makes them the creator', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'member-db',
          distribution: null,
          assignments: [],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
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
          scope: TaskScope.GLOBAL,
          status: TaskStatus.PENDING,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.SENT },
          assignments: [],
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

  it('locks a malformed TEAM Task that has a sent distribution', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.SENT },
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
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
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.CANCELLED },
          assignments: [],
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
            uploadedById: 'owner-db',
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

  it('allows the current Responsible Member to delete their own upload', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'attachment-db',
          publicId: '22222222-2222-4222-8222-222222222222',
          fileId: 'file-db',
          file: {
            publicId: '33333333-3333-4333-8333-333333333333',
            uploadedById: 'member-db',
            storageKey: 'private/member-storage-key',
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
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toEqual({ id: '22222222-2222-4222-8222-222222222222' });
    expect(storage.destroy).toHaveBeenCalledWith('private/member-storage-key');
  });

  it('allows the current Responsible Member to delete their own upload on a sent GLOBAL Task', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.GLOBAL,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: { status: TaskDistributionStatus.SENT },
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'attachment-db',
          publicId: '22222222-2222-4222-8222-222222222222',
          fileId: 'file-db',
          file: {
            publicId: '33333333-3333-4333-8333-333333333333',
            uploadedById: 'member-db',
            storageKey: 'private/member-storage-key',
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
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toEqual({ id: '22222222-2222-4222-8222-222222222222' });
    expect(storage.destroy).toHaveBeenCalledWith('private/member-storage-key');
  });

  it('denies the current Responsible Member deleting an Admin upload', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'attachment-db',
          publicId: '22222222-2222-4222-8222-222222222222',
          fileId: 'file-db',
          file: {
            publicId: '33333333-3333-4333-8333-333333333333',
            uploadedById: 'owner-db',
            storageKey: 'private/admin-storage-key',
          },
        }),
        delete: jestApi.fn(),
      },
      submissionAttachment: { count: jestApi.fn() },
      fileAsset: { delete: jestApi.fn() },
      activityLog: { create: jestApi.fn() },
    };
    const { service, storage } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(storage.assertEnabled).not.toHaveBeenCalled();
    expect(tx.taskAttachment.delete).not.toHaveBeenCalled();
  });

  it('returns 404 for a current Responsible Member when the attachment is missing on that Task', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn().mockResolvedValue(null) },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(tx.taskAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: '22222222-2222-4222-8222-222222222222',
          taskId: 'task-db',
        },
      }),
    );
  });

  it('revokes a former Responsible Member immediately after reassignment', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.ASSIGNED,
          startedAt: null,
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'new-member-db' }],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'old-member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(tx.taskAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('locks an authorized Responsible Member after execution starts', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.IN_PROGRESS,
          startedAt: new Date('2026-09-28T00:00:00.000Z'),
          createdById: 'owner-db',
          distribution: null,
          assignments: [{ responsibleUserId: 'member-db' }],
        }),
      },
      taskAttachment: { findFirst: jestApi.fn() },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteTaskAttachment(
        viewer(UserRole.MEMBER, 'member-db'),
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_ATTACHMENTS_NOT_EDITABLE },
    });
    expect(tx.taskAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('locks attachment mutation after execution starts', async () => {
    const tx = {
      task: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          scope: TaskScope.TEAM,
          status: TaskStatus.IN_PROGRESS,
          startedAt: new Date('2026-09-28T00:00:00.000Z'),
          createdById: 'owner-db',
          distribution: null,
          assignments: [],
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
