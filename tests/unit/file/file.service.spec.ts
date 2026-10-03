import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { FileService } from '../../../src/modules/file/file.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { FileStorageService } from '../../../src/shared/file-storage/file-storage.service';

const jestApi = import.meta.jest;

function viewer(
  userId: string,
  role: UserRole,
  scope: OperixViewer['scope'],
): OperixViewer {
  return { userId, role, status: UserStatus.ACTIVE, scope };
}

const MEMBER_A = viewer('member-a', UserRole.MEMBER, {
  type: 'MEMBER',
  teamId: 'team-a',
});
const ADMIN_A = viewer('admin-a', UserRole.ADMIN, {
  type: 'ADMIN',
  teamIds: ['team-a'],
});

function fileRow() {
  return {
    id: 'file-a',
    originalName: 'A.pdf',
    mimeType: 'application/pdf',
    storageKey: 'storage-a',
    taskAttachments: [{ taskId: 'task-a' }],
    submissionAttachments: [{ submissionId: 'submission-a' }],
  };
}

function createHarness(options: {
  taskParent: boolean;
  submissionParent: boolean;
  documentLibrary: boolean;
}) {
  const prisma = {
    fileAsset: {
      findUnique: jestApi.fn().mockResolvedValue(fileRow()),
      findFirst: jestApi
        .fn()
        .mockResolvedValue(options.documentLibrary ? { id: 'file-a' } : null),
    },
    task: {
      findFirst: jestApi
        .fn()
        .mockResolvedValue(options.taskParent ? { id: 'task-a' } : null),
    },
    taskSubmission: {
      findFirst: jestApi
        .fn()
        .mockResolvedValue(
          options.submissionParent ? { id: 'submission-a' } : null,
        ),
    },
  };
  const storage = {
    download: jestApi.fn().mockResolvedValue({ stream: {} }),
  };
  const service = new FileService(
    prisma as unknown as PrismaService,
    storage as unknown as FileStorageService,
  );
  return { prisma, storage, service };
}

describe('FileService document download branch', () => {
  it('keeps task-parent access when document scope denies', async () => {
    const { service, storage } = createHarness({
      taskParent: true,
      submissionParent: false,
      documentLibrary: false,
    });

    const result = await service.downloadFile(MEMBER_A, 'file-public-a');

    expect(result.originalName).toBe('A.pdf');
    expect(storage.download).toHaveBeenCalledWith('storage-a');
  });

  it('keeps submission-parent access when document scope denies', async () => {
    const { service } = createHarness({
      taskParent: false,
      submissionParent: true,
      documentLibrary: false,
    });

    await expect(
      service.downloadFile(MEMBER_A, 'file-public-a'),
    ).resolves.toMatchObject({ originalName: 'A.pdf' });
  });

  it('grants document-library access when parents deny', async () => {
    const { service, prisma } = createHarness({
      taskParent: false,
      submissionParent: false,
      documentLibrary: true,
    });

    const result = await service.downloadFile(ADMIN_A, 'file-public-a');

    expect(result.originalName).toBe('A.pdf');
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'file-a', AND: [expect.any(Object)] },
      select: { id: true },
    });
  });

  it('denies files outside every scope with safe not-found', async () => {
    const { service } = createHarness({
      taskParent: false,
      submissionParent: false,
      documentLibrary: false,
    });

    try {
      await service.downloadFile(MEMBER_A, 'file-public-a');
      throw new Error('Expected download to fail.');
    } catch (error) {
      const exception = error as {
        getStatus: () => number;
        getResponse: () => unknown;
      };
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(exception.getResponse()).toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    }
  });
});
