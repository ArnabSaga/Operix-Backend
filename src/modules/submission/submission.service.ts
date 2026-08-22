import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { TaskStatus } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MAX_ATTACHMENT_FILES } from '../../shared/file-storage/file-storage.constant.js';
import { FileStorageService } from '../../shared/file-storage/file-storage.service.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../shared/pagination/pagination.interface.js';
import { TASK_ERROR_CODE } from '../task/task.constant.js';
import { mapAttachmentResponse } from '../file/file.mapper.js';
import { safeAttachmentSelect } from '../file/file.select.js';
import type { SafeAttachmentResponse } from '../file/file.interface.js';
import type { CreateSubmissionDto } from './dto/create-submission.dto.js';
import { buildSubmissionScopeWhere } from './policies/submission-scope.policy.js';
import {
  SUBMISSION_ACTIVITY,
  SUBMISSION_ERROR_CODE,
  SUBMISSION_NOTIFICATION,
} from './submission.constant.js';
import type {
  PaginatedSubmissionResponse,
  SafeSubmissionResponse,
} from './submission.interface.js';
import { mapSubmissionResponse } from './submission.mapper.js';
import { submissionSelect } from './submission.select.js';

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage?: FileStorageService,
  ) {}

  async createSubmission(
    viewer: OperixViewer,
    taskId: string,
    dto: CreateSubmissionDto,
    files?: Express.Multer.File[],
  ): Promise<SafeSubmissionResponse> {
    const hasIncomingFiles = (files?.length ?? 0) > 0;
    const validatedFiles = hasIncomingFiles
      ? await this.getStorage().validateFiles(files, {
          requireAtLeastOne: false,
        })
      : [];

    if (validatedFiles.length > MAX_ATTACHMENT_FILES) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.TOO_MANY_FILES,
        'Too many files were uploaded.',
      );
    }

    if (validatedFiles.length > 0) {
      await this.assertSubmissionPrecheck(viewer, taskId);
    }

    const uploaded =
      validatedFiles.length > 0
        ? await this.getStorage().uploadValidatedFiles(
            validatedFiles,
            'submission-attachments',
          )
        : [];

    try {
      const submission = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const task = await tx.task.findFirst({
            where: {
              id: taskId,
              assignments: {
                some: {
                  memberId: viewer.userId,
                  unassignedAt: null,
                },
              },
            },
            select: {
              id: true,
              status: true,
              team: {
                select: {
                  adminId: true,
                },
              },
            },
          });

          if (!task) {
            throw this.taskNotFound();
          }

          if (
            task.status !== TaskStatus.IN_PROGRESS &&
            task.status !== TaskStatus.REVISION_REQUIRED
          ) {
            throw this.submissionNotAllowed();
          }

          const latestSubmission = await tx.taskSubmission.findFirst({
            where: {
              taskId,
            },
            orderBy: {
              version: 'desc',
            },
            select: {
              version: true,
            },
          });

          const isResubmission = task.status === TaskStatus.REVISION_REQUIRED;

          if (isResubmission && !latestSubmission) {
            throw this.submissionNotAllowed();
          }

          const nextVersion = (latestSubmission?.version ?? 0) + 1;
          const nextStatus = isResubmission
            ? TaskStatus.RESUBMITTED
            : TaskStatus.SUBMITTED;
          const action = isResubmission
            ? SUBMISSION_ACTIVITY.TASK_RESUBMITTED
            : SUBMISSION_ACTIVITY.TASK_SUBMITTED;

          const submission = await tx.taskSubmission.create({
            data: {
              taskId,
              submittedById: viewer.userId,
              version: nextVersion,
              submissionText: dto.submissionText,
            },
            select: submissionSelect,
          });

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

            await tx.submissionAttachment.create({
              data: {
                submissionId: submission.id,
                fileId: fileAsset.id,
              },
            });
          }

          await tx.task.update({
            where: {
              id: taskId,
            },
            data: {
              status: nextStatus,
            },
            select: {
              id: true,
            },
          });

          await tx.taskStatusHistory.create({
            data: {
              taskId,
              fromStatus: task.status,
              toStatus: nextStatus,
              changedById: viewer.userId,
              notes: isResubmission ? 'Task resubmitted.' : 'Task submitted.',
            },
          });

          await writeActivity(tx, {
            actorId: viewer.userId,
            action,
            entityType: 'TASK',
            entityId: taskId,
            metadata: {
              taskId,
              submissionId: submission.id,
              version: submission.version,
            },
          });

          await createNotification(tx, {
            receiverId: task.team.adminId,
            actorId: viewer.userId,
            type: isResubmission
              ? SUBMISSION_NOTIFICATION.TASK_RESUBMITTED
              : SUBMISSION_NOTIFICATION.TASK_SUBMITTED,
            title: isResubmission ? 'Task resubmitted' : 'Task submitted',
            body: isResubmission
              ? 'A revised task submission is ready for review.'
              : 'A task submission is ready for review.',
            targetType: 'SUBMISSION',
            targetId: submission.id,
          });

          if (uploaded.length === 0) {
            return submission;
          }

          const submissionWithAttachments =
            await tx.taskSubmission.findUniqueOrThrow({
              where: {
                id: submission.id,
              },
              select: submissionSelect,
            });

          return submissionWithAttachments;
        },
      );

      return mapSubmissionResponse(submission);
    } catch (error) {
      if (uploaded.length > 0) {
        await this.getStorage().destroyUploadedBestEffort(
          uploaded,
          'submission transaction rollback',
        );
      }
      throw mapSubmissionConflict(error);
    }
  }

  async listTaskSubmissions(
    viewer: OperixViewer,
    taskId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedSubmissionResponse> {
    const normalized = normalizePagination(pagination);
    const where: Prisma.TaskSubmissionWhereInput = {
      taskId,
      ...buildSubmissionScopeWhere(viewer),
    };

    const [data, total] = await Promise.all([
      this.prisma.taskSubmission.findMany({
        where,
        select: submissionSelect,
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.taskSubmission.count({
        where,
      }),
    ]);

    return {
      data: data.map(mapSubmissionResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getSubmission(
    viewer: OperixViewer,
    submissionId: string,
  ): Promise<SafeSubmissionResponse> {
    const submission = await this.prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        ...buildSubmissionScopeWhere(viewer),
      },
      select: submissionSelect,
    });

    if (!submission) {
      throw this.submissionNotFound();
    }

    return mapSubmissionResponse(submission);
  }

  async listSubmissionAttachments(
    viewer: OperixViewer,
    submissionId: string,
  ): Promise<SafeAttachmentResponse[]> {
    const submission = await this.prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        ...buildSubmissionScopeWhere(viewer),
      },
      select: {
        id: true,
      },
    });

    if (!submission) {
      throw this.submissionNotFound();
    }

    const attachments = await this.prisma.submissionAttachment.findMany({
      where: {
        submissionId,
      },
      select: safeAttachmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return attachments.map(mapAttachmentResponse);
  }

  private async assertSubmissionPrecheck(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        assignments: {
          some: {
            memberId: viewer.userId,
            unassignedAt: null,
          },
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

    if (
      task.status !== TaskStatus.IN_PROGRESS &&
      task.status !== TaskStatus.REVISION_REQUIRED
    ) {
      throw this.submissionNotAllowed();
    }
  }

  private taskNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TASK_ERROR_CODE.TASK_NOT_FOUND,
      'Task not found.',
    );
  }

  private submissionNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
      'Submission not found.',
    );
  }

  private submissionNotAllowed(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      SUBMISSION_ERROR_CODE.SUBMISSION_NOT_ALLOWED,
      'Task is not in a submittable state.',
    );
  }

  private getStorage(): FileStorageService {
    if (!this.storage) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.FILE_STORAGE_UNAVAILABLE,
        'File storage is unavailable.',
      );
    }

    return this.storage;
  }
}

function mapSubmissionConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      APP_ERROR_CODE.CONCURRENT_MODIFICATION,
      'The resource changed while processing this request. Please retry.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}
