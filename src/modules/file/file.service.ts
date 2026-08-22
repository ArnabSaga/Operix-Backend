import { HttpStatus, Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { FileStorageService } from '../../shared/file-storage/file-storage.service.js';
import { buildSubmissionScopeWhere } from '../submission/policies/submission-scope.policy.js';
import { buildTaskScopeWhere } from '../task/policies/task-scope.policy.js';

export interface AuthorizedFileDownload {
  stream: Readable;
  mimeType: string;
  originalName: string;
}

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async downloadFile(
    viewer: OperixViewer,
    fileId: string,
  ): Promise<AuthorizedFileDownload> {
    const file = await this.prisma.fileAsset.findUnique({
      where: {
        id: fileId,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        storageKey: true,
        taskAttachments: {
          select: {
            taskId: true,
          },
        },
        submissionAttachments: {
          select: {
            submissionId: true,
          },
        },
      },
    });

    if (!file) {
      throw this.fileNotFound();
    }

    const authorized = await this.canReadFileParent(viewer, file);

    if (!authorized) {
      throw this.fileNotFound();
    }

    const download = await this.storage.download(file.storageKey);

    return {
      stream: download.stream,
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }

  private async canReadFileParent(
    viewer: OperixViewer,
    file: {
      taskAttachments: { taskId: string }[];
      submissionAttachments: { submissionId: string }[];
    },
  ): Promise<boolean> {
    for (const attachment of file.taskAttachments) {
      const task = await this.prisma.task.findFirst({
        where: {
          id: attachment.taskId,
          AND: [buildTaskScopeWhere(viewer)],
        },
        select: {
          id: true,
        },
      });

      if (task) {
        return true;
      }
    }

    for (const attachment of file.submissionAttachments) {
      const submission = await this.prisma.taskSubmission.findFirst({
        where: {
          id: attachment.submissionId,
          AND: [buildSubmissionScopeWhere(viewer)],
        } satisfies Prisma.TaskSubmissionWhereInput,
        select: {
          id: true,
        },
      });

      if (submission) {
        return true;
      }
    }

    return false;
  }

  private fileNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      APP_ERROR_CODE.FILE_NOT_FOUND,
      'File not found.',
    );
  }
}
