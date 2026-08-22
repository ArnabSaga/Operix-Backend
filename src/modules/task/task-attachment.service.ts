import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { TaskStatus, UserRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MAX_ATTACHMENT_FILES } from '../../shared/file-storage/file-storage.constant.js';
import { FileStorageService } from '../../shared/file-storage/file-storage.service.js';
import { mapAttachmentResponse } from '../file/file.mapper.js';
import { safeAttachmentSelect } from '../file/file.select.js';
import type { SafeAttachmentResponse } from '../file/file.interface.js';
import { buildTaskScopeWhere } from './policies/task-scope.policy.js';
import { TASK_ACTIVITY, TASK_ERROR_CODE } from './task.constant.js';

@Injectable()
export class TaskAttachmentService {
  private readonly logger = new Logger(TaskAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async uploadTaskAttachments(
    viewer: OperixViewer,
    taskId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<SafeAttachmentResponse[]> {
    this.assertRole(viewer, UserRole.ADMIN);

    const validatedFiles = await this.storage.validateFiles(files, {
      requireAtLeastOne: true,
    });

    await this.assertTaskCanMutateAttachments(
      this.prisma,
      viewer.userId,
      taskId,
    );
    await this.assertTaskAttachmentCapacity(
      this.prisma,
      taskId,
      validatedFiles.length,
    );

    const uploaded = await this.storage.uploadValidatedFiles(
      validatedFiles,
      'task-attachments',
    );

    try {
      return await runSerializableTransaction(this.prisma, async (tx) => {
        await this.assertTaskCanMutateAttachments(tx, viewer.userId, taskId);
        await this.assertTaskAttachmentCapacity(tx, taskId, uploaded.length);

        const created: SafeAttachmentResponse[] = [];

        for (const file of uploaded) {
          const fileAsset = await tx.fileAsset.create({
            data: {
              originalName: file.originalName,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              storageKey: file.storageKey,
              publicUrl: null,
              uploadedById: viewer.userId,
            },
            select: {
              id: true,
            },
          });

          const attachment = await tx.taskAttachment.create({
            data: {
              taskId,
              fileId: fileAsset.id,
            },
            select: safeAttachmentSelect,
          });

          created.push(mapAttachmentResponse(attachment));
        }

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TASK_ACTIVITY.TASK_ATTACHMENTS_ADDED,
          entityType: 'TASK',
          entityId: taskId,
          metadata: {
            taskId,
            fileCount: uploaded.length,
          },
        });

        return created;
      });
    } catch (error) {
      await this.storage.destroyUploadedBestEffort(
        uploaded,
        'task attachment transaction rollback',
      );
      throw error;
    }
  }

  async listTaskAttachments(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<SafeAttachmentResponse[]> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        AND: [buildTaskScopeWhere(viewer)],
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw this.taskNotFound();
    }

    const attachments = await this.prisma.taskAttachment.findMany({
      where: {
        taskId,
      },
      select: safeAttachmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return attachments.map(mapAttachmentResponse);
  }

  async deleteTaskAttachment(
    viewer: OperixViewer,
    taskId: string,
    attachmentId: string,
  ): Promise<{ id: string }> {
    this.assertRole(viewer, UserRole.ADMIN);
    this.storage.assertEnabled();

    const deleted = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        await this.assertTaskCanMutateAttachments(tx, viewer.userId, taskId);

        const attachment = await tx.taskAttachment.findFirst({
          where: {
            id: attachmentId,
            taskId,
          },
          select: {
            id: true,
            fileId: true,
            file: {
              select: {
                storageKey: true,
              },
            },
          },
        });

        if (!attachment) {
          throw this.fileNotFound();
        }

        const [taskAttachmentCount, submissionAttachmentCount] =
          await Promise.all([
            tx.taskAttachment.count({
              where: {
                fileId: attachment.fileId,
              },
            }),
            tx.submissionAttachment.count({
              where: {
                fileId: attachment.fileId,
              },
            }),
          ]);

        if (taskAttachmentCount !== 1 || submissionAttachmentCount !== 0) {
          this.logger.error(
            `FileAsset ${attachment.fileId} has invalid attachment references.`,
          );
          throw new AppException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
            'File attachment integrity violation.',
          );
        }

        await tx.taskAttachment.delete({
          where: {
            id: attachment.id,
          },
        });

        await tx.fileAsset.delete({
          where: {
            id: attachment.fileId,
          },
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TASK_ACTIVITY.TASK_ATTACHMENT_REMOVED,
          entityType: 'TASK',
          entityId: taskId,
          metadata: {
            taskId,
            attachmentId: attachment.id,
            fileId: attachment.fileId,
          },
        });

        return {
          id: attachment.id,
          storageKey: attachment.file.storageKey,
        };
      },
    );

    try {
      await this.storage.destroy(deleted.storageKey);
    } catch (error) {
      this.logger.warn(
        `Cloudinary cleanup failed after task attachment delete ${attachmentId}: ${getErrorMessage(error)}`,
      );
    }

    return {
      id: deleted.id,
    };
  }

  private async assertTaskCanMutateAttachments(
    prisma: Pick<PrismaTransactionClient, 'task'>,
    adminId: string,
    taskId: string,
  ): Promise<void> {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        team: {
          adminId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!task) {
      throw this.taskNotFound();
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_ATTACHMENTS_NOT_EDITABLE,
        'Task attachments can only be changed while the task is pending.',
      );
    }
  }

  private async assertTaskAttachmentCapacity(
    prisma: Pick<PrismaTransactionClient, 'taskAttachment'>,
    taskId: string,
    incomingCount: number,
  ): Promise<void> {
    const currentCount = await prisma.taskAttachment.count({
      where: {
        taskId,
      },
    });

    if (currentCount + incomingCount > MAX_ATTACHMENT_FILES) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.ATTACHMENT_LIMIT_REACHED,
        'Attachment limit reached.',
      );
    }
  }

  private assertRole(viewer: OperixViewer, role: UserRole): void {
    if (viewer.role !== role) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private taskNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_NOT_FOUND,
      'Task not found.',
    );
  }

  private fileNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      APP_ERROR_CODE.FILE_NOT_FOUND,
      'File not found.',
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown storage error';
}
