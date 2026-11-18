import { HttpStatus } from '@nestjs/common';
import {
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  SUBMISSION_ACTIVITY,
  SUBMISSION_ERROR_CODE,
} from '../../../src/modules/submission/submission.constant';
import { SubmissionService } from '../../../src/modules/submission/submission.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import type { FileStorageService } from '../../../src/shared/file-storage/file-storage.service';

const jestApi = import.meta.jest;
const beforeDeadline = new Date('2099-11-08T10:00:00.000Z');
const pastDeadline = new Date('2020-11-08T10:00:00.000Z');
const timestamp = new Date('2026-11-08T10:00:00.000Z');

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

function editableSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'submission-private',
    publicId: '22222222-2222-4222-8222-222222222222',
    taskId: 'task-private',
    submittedById: 'member-a',
    version: 2,
    submissionText: 'Original work summary',
    reviews: [],
    task: {
      status: TaskStatus.RESUBMITTED,
      dueAt: beforeDeadline,
      assignments: [{ responsibleUserId: 'member-a' }],
    },
    ...overrides,
  };
}

function responseSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'submission-private',
    publicId: '22222222-2222-4222-8222-222222222222',
    taskId: 'task-private',
    submittedById: 'member-a',
    task: { publicId: '11111111-1111-4111-8111-111111111111' },
    submittedBy: {
      publicId: 'member-public',
      name: 'Member A',
      role: UserRole.MEMBER,
      employeeId: null,
      designation: null,
    },
    version: 2,
    submissionText: 'Updated work summary',
    submittedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastEditedBy: { publicId: 'editor-public', name: 'Editor' },
    attachments: [],
    ...overrides,
  };
}

function createHarness(
  context = editableSubmission(),
  latestId = 'submission-private',
) {
  const selected = responseSubmission();
  const tx = {
    taskSubmission: {
      findFirst: jestApi
        .fn()
        .mockResolvedValueOnce(context)
        .mockResolvedValueOnce({ id: latestId }),
      findUnique: jestApi.fn().mockResolvedValue(selected),
      update: jestApi.fn().mockResolvedValue(selected),
    },
    submissionAttachment: {
      count: jestApi.fn().mockResolvedValue(0),
      create: jestApi.fn(),
      findFirst: jestApi.fn(),
      delete: jestApi.fn(),
    },
    taskAttachment: { count: jestApi.fn().mockResolvedValue(0) },
    fileAsset: { create: jestApi.fn(), delete: jestApi.fn() },
    activityLog: { create: jestApi.fn().mockResolvedValue({ id: 'activity' }) },
  };
  const prisma = {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const storage = {
    validateFiles: jestApi.fn(),
    uploadValidatedFiles: jestApi.fn(),
    destroyUploadedBestEffort: jestApi.fn(),
    assertEnabled: jestApi.fn(),
    destroy: jestApi.fn(),
  };
  const service = new SubmissionService(
    prisma as unknown as PrismaService,
    storage as unknown as FileStorageService,
  );
  return { service, tx, storage, selected };
}

function expectCode(error: unknown, status: number, code: string): void {
  const exception = error as {
    getStatus(): number;
    getResponse(): { code: string };
  };
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse().code).toBe(code);
}

describe('SubmissionService editing', () => {
  it('lets the original current Responsible edit the latest unreviewed version before deadline', async () => {
    const { service, tx } = createHarness();

    const result = await service.updateSubmission(
      viewer(UserRole.MEMBER, 'member-a'),
      '22222222-2222-4222-8222-222222222222',
      { submissionText: 'Updated work summary' },
    );

    expect(result.submissionText).toBe('Updated work summary');
    expect(result.lastEditedBy).toEqual({
      id: 'editor-public',
      name: 'Editor',
    });
    expect(tx.taskSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'submission-private' },
        data: {
          submissionText: 'Updated work summary',
          lastEditedById: 'member-a',
        },
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'member-a',
        action: SUBMISSION_ACTIVITY.SUBMISSION_UPDATED,
        entityId: 'submission-private',
        metadata: {
          version: 2,
          changedFields: ['submissionText'],
          deadlineOverride: false,
        },
      }) as object,
    });
  });

  it('allows an Admin submitter who is still current Responsible', async () => {
    const context = editableSubmission({
      submittedById: 'admin-a',
      task: {
        status: TaskStatus.SUBMITTED,
        dueAt: beforeDeadline,
        assignments: [{ responsibleUserId: 'admin-a' }],
      },
    });
    const { service } = createHarness(context);

    await expect(
      service.updateSubmission(
        viewer(UserRole.ADMIN, 'admin-a'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      ),
    ).resolves.toBeDefined();
  });

  it('locks a normal submitter at the deadline boundary', async () => {
    const context = editableSubmission({
      task: {
        status: TaskStatus.SUBMITTED,
        dueAt: pastDeadline,
        assignments: [{ responsibleUserId: 'member-a' }],
      },
    });
    const { service } = createHarness(context);

    await service
      .updateSubmission(
        viewer(UserRole.MEMBER, 'member-a'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(
          error,
          HttpStatus.CONFLICT,
          SUBMISSION_ERROR_CODE.SUBMISSION_EDIT_DEADLINE_PASSED,
        ),
      );
  });

  it('lets Super Admin edit another user submission after deadline and records override', async () => {
    const context = editableSubmission({
      task: {
        status: TaskStatus.SUBMITTED,
        dueAt: pastDeadline,
        assignments: [{ responsibleUserId: 'member-a' }],
      },
    });
    const { service, tx } = createHarness(context);

    await service.updateSubmission(
      viewer(UserRole.SUPER_ADMIN, 'chief'),
      '22222222-2222-4222-8222-222222222222',
      { submissionText: 'Updated work summary' },
    );

    expect(tx.taskSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastEditedById: 'chief' }) as object,
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ deadlineOverride: true }) as object,
      }) as object,
    });
  });

  it('keeps a reviewed submission immutable for Super Admin', async () => {
    const { service } = createHarness(
      editableSubmission({ reviews: [{ id: 'review-private' }] }),
    );

    await service
      .updateSubmission(
        viewer(UserRole.SUPER_ADMIN, 'chief'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(
          error,
          HttpStatus.CONFLICT,
          SUBMISSION_ERROR_CODE.SUBMISSION_NOT_EDITABLE,
        ),
      );
  });

  it('keeps an older Submission version immutable', async () => {
    const { service } = createHarness(
      editableSubmission(),
      'newer-submission-private',
    );

    await service
      .updateSubmission(
        viewer(UserRole.SUPER_ADMIN, 'chief'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(
          error,
          HttpStatus.CONFLICT,
          SUBMISSION_ERROR_CODE.SUBMISSION_NOT_EDITABLE,
        ),
      );
  });

  it('denies the former Responsible before exposing edit state', async () => {
    const context = editableSubmission({
      task: {
        status: TaskStatus.COMPLETED,
        dueAt: pastDeadline,
        assignments: [{ responsibleUserId: 'member-b' }],
      },
    });
    const { service } = createHarness(context);

    await service
      .updateSubmission(
        viewer(UserRole.MEMBER, 'member-a'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(error, HttpStatus.FORBIDDEN, APP_ERROR_CODE.FORBIDDEN),
      );
  });

  it('allows a null deadline until review', async () => {
    const context = editableSubmission({
      task: {
        status: TaskStatus.SUBMITTED,
        dueAt: null,
        assignments: [{ responsibleUserId: 'member-a' }],
      },
    });
    const { service } = createHarness(context);

    await expect(
      service.updateSubmission(
        viewer(UserRole.MEMBER, 'member-a'),
        '22222222-2222-4222-8222-222222222222',
        { submissionText: 'Updated work summary' },
      ),
    ).resolves.toBeDefined();
  });
});

describe('SubmissionService attachment editing', () => {
  function attachmentSource() {
    return {
      id: 'submission-attachment-private',
      file: {
        id: 'file-private',
        publicId: '33333333-3333-4333-8333-333333333333',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        uploadedById: 'member-a',
        uploadedBy: { publicId: 'member-public', name: 'Member A' },
        createdAt: timestamp,
      },
    };
  }

  function attachmentHarness(context = editableSubmission()) {
    const outerTaskSubmission = {
      findFirst: jestApi
        .fn()
        .mockResolvedValueOnce(context)
        .mockResolvedValueOnce({ id: 'submission-private' }),
    };
    const tx = {
      taskSubmission: {
        findFirst: jestApi
          .fn()
          .mockResolvedValueOnce(context)
          .mockResolvedValueOnce({ id: 'submission-private' }),
        findUnique: jestApi.fn().mockResolvedValue({
          publicId: '22222222-2222-4222-8222-222222222222',
        }),
        update: jestApi.fn().mockResolvedValue({ id: 'submission-private' }),
      },
      submissionAttachment: {
        count: jestApi.fn().mockResolvedValue(0),
        create: jestApi.fn().mockResolvedValue(attachmentSource()),
        findFirst: jestApi.fn(),
        delete: jestApi.fn(),
      },
      taskAttachment: { count: jestApi.fn().mockResolvedValue(0) },
      fileAsset: {
        create: jestApi.fn().mockResolvedValue({ id: 'file-private' }),
        delete: jestApi.fn(),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity' }),
      },
    };
    const prisma = {
      taskSubmission: outerTaskSubmission,
      submissionAttachment: { count: jestApi.fn().mockResolvedValue(0) },
      $transaction: jestApi.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const validated = {
      originalName: 'evidence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      buffer: Buffer.from('%PDF'),
    };
    const storage = {
      validateFiles: jestApi.fn().mockResolvedValue([validated]),
      uploadValidatedFiles: jestApi
        .fn()
        .mockResolvedValue([
          { ...validated, storageKey: 'private/storage-key' },
        ]),
      destroyUploadedBestEffort: jestApi.fn(),
      assertEnabled: jestApi.fn(),
      destroy: jestApi.fn().mockResolvedValue(undefined),
    };
    const service = new SubmissionService(
      prisma as unknown as PrismaService,
      storage as unknown as FileStorageService,
    );
    return { service, prisma, tx, storage };
  }

  it('adds evidence for the current submitter and updates the edit audit', async () => {
    const { service, tx } = attachmentHarness();

    const result = await service.uploadSubmissionAttachments(
      viewer(UserRole.MEMBER, 'member-a'),
      '22222222-2222-4222-8222-222222222222',
      [{} as Express.Multer.File],
    );

    expect(result).toEqual([
      expect.objectContaining({
        file: expect.objectContaining({
          id: '33333333-3333-4333-8333-333333333333',
        }) as object,
      }),
    ]);
    expect(tx.taskSubmission.update).toHaveBeenCalledWith({
      where: { id: 'submission-private' },
      data: { lastEditedById: 'member-a' },
      select: { id: true },
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: SUBMISSION_ACTIVITY.SUBMISSION_ATTACHMENTS_ADDED,
        metadata: {
          version: 2,
          fileCount: 1,
          deadlineOverride: false,
        },
      }) as object,
    });
  });

  it('checks edit authority before file validation or storage work', async () => {
    const { service, storage } = attachmentHarness(
      editableSubmission({
        task: {
          status: TaskStatus.SUBMITTED,
          dueAt: beforeDeadline,
          assignments: [{ responsibleUserId: 'member-b' }],
        },
      }),
    );

    await service
      .uploadSubmissionAttachments(
        viewer(UserRole.MEMBER, 'member-a'),
        '22222222-2222-4222-8222-222222222222',
        [{} as Express.Multer.File],
      )
      .then(() => fail('expected rejection'))
      .catch((error: unknown) =>
        expectCode(error, HttpStatus.FORBIDDEN, APP_ERROR_CODE.FORBIDDEN),
      );
    expect(storage.validateFiles).not.toHaveBeenCalled();
    expect(storage.uploadValidatedFiles).not.toHaveBeenCalled();
  });

  it('deletes a scoped attachment and updates lastEditedBy', async () => {
    const { service, tx, storage } = attachmentHarness();
    tx.submissionAttachment.findFirst.mockResolvedValue({
      id: 'submission-attachment-private',
      fileId: 'file-private',
      file: {
        publicId: '33333333-3333-4333-8333-333333333333',
        storageKey: 'private/storage-key',
      },
    });
    tx.submissionAttachment.count.mockResolvedValue(1);

    await expect(
      service.deleteSubmissionAttachment(
        viewer(UserRole.MEMBER, 'member-a'),
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ),
    ).resolves.toEqual({ id: '33333333-3333-4333-8333-333333333333' });
    expect(tx.submissionAttachment.findFirst).toHaveBeenCalledWith({
      where: {
        submissionId: 'submission-private',
        file: { publicId: '33333333-3333-4333-8333-333333333333' },
      },
      select: expect.any(Object) as object,
    });
    expect(tx.taskSubmission.update).toHaveBeenCalledWith({
      where: { id: 'submission-private' },
      data: { lastEditedById: 'member-a' },
      select: { id: true },
    });
    expect(storage.destroy).toHaveBeenCalledWith('private/storage-key');
  });
});
