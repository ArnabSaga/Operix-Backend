import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskCompletionMode,
  TaskStatus,
  UserRole,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
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
import { mapSubmissionAttachmentResponse } from '../file/file.mapper.js';
import { safeAttachmentSelect } from '../file/file.select.js';
import type { SafeSubmissionAttachmentResponse } from '../file/file.interface.js';
import type { CreateSubmissionDto } from './dto/create-submission.dto.js';
import type { UpdateSubmissionDto } from './dto/update-submission.dto.js';
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

// Submission creation performs Task lookup, version resolution, submission
// and attachment persistence, Task status/history writes, Activity and
// Notification writes with public-ID resolution, and a final safe-response
// read inside one serializable transaction. Remote pooled databases can
// exceed Prisma's 5s default interactive transaction timeout (P2028), so the
// transaction carries an explicit budget. This changes no business logic,
// eligibility, or side-effect behavior.
const SUBMISSION_TRANSACTION_TIMEOUT_MS = 15_000;

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

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
              publicId: taskId,
              assignments: {
                some: {
                  responsibleUserId: viewer.userId,
                  unassignedAt: null,
                },
              },
            },
            select: {
              id: true,
              status: true,
              completionMode: true,
              reviewerUserId: true,
            },
          });

          if (!task) {
            throw this.taskNotFound();
          }

          if (task.completionMode === TaskCompletionMode.DIRECT) {
            throw new AppException(
              HttpStatus.CONFLICT,
              TASK_ERROR_CODE.TASK_DIRECT_COMPLETION_REQUIRED,
              'Direct tasks must be completed through the completion action.',
            );
          }

          if (!task.reviewerUserId) {
            throw this.submissionNotAllowed();
          }

          if (
            task.status !== TaskStatus.IN_PROGRESS &&
            task.status !== TaskStatus.REVISION_REQUIRED
          ) {
            throw this.submissionNotAllowed();
          }

          const latestSubmission = await tx.taskSubmission.findFirst({
            where: {
              taskId: task.id,
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
              taskId: task.id,
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
              id: task.id,
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
              taskId: task.id,
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
            entityId: task.id,
            metadata: {
              taskId: task.id,
              submissionId: submission.id,
              version: submission.version,
            },
          });

          await createNotification(tx, {
            receiverId: task.reviewerUserId,
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
        { timeoutMs: SUBMISSION_TRANSACTION_TIMEOUT_MS },
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
      task: { publicId: taskId },
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
        publicId: submissionId,
        ...buildSubmissionScopeWhere(viewer),
      },
      select: submissionSelect,
    });

    if (!submission) {
      throw this.submissionNotFound();
    }

    return mapSubmissionResponse(submission);
  }

  async updateSubmission(
    viewer: OperixViewer,
    submissionId: string,
    dto: UpdateSubmissionDto,
  ): Promise<SafeSubmissionResponse> {
    const now = new Date();
    const submission = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const editable = await this.resolveEditableSubmission(
          tx,
          viewer,
          submissionId,
          now,
        );

        if (editable.submissionText === dto.submissionText) {
          const current = await tx.taskSubmission.findUnique({
            where: { id: editable.id },
            select: submissionSelect,
          });
          if (!current) throw this.submissionNotFound();
          return current;
        }

        const updated = await tx.taskSubmission.update({
          where: { id: editable.id },
          data: {
            submissionText: dto.submissionText,
            lastEditedById: viewer.userId,
          },
          select: submissionSelect,
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: SUBMISSION_ACTIVITY.SUBMISSION_UPDATED,
          entityType: 'SUBMISSION',
          entityId: editable.id,
          metadata: {
            version: editable.version,
            changedFields: ['submissionText'],
            deadlineOverride: editable.deadlineOverride,
          },
        });

        return updated;
      },
      { timeoutMs: SUBMISSION_TRANSACTION_TIMEOUT_MS },
    );

    return mapSubmissionResponse(submission);
  }

  async uploadSubmissionAttachments(
    viewer: OperixViewer,
    submissionId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<SafeSubmissionAttachmentResponse[]> {
    const initial = await this.resolveEditableSubmission(
      this.prisma,
      viewer,
      submissionId,
      new Date(),
    );
    const validatedFiles = await this.getStorage().validateFiles(files, {
      requireAtLeastOne: true,
    });
    await this.assertSubmissionAttachmentCapacity(
      this.prisma,
      initial.id,
      validatedFiles.length,
    );
    const uploaded = await this.getStorage().uploadValidatedFiles(
      validatedFiles,
      'submission-attachments',
    );

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const editable = await this.resolveEditableSubmission(
            tx,
            viewer,
            submissionId,
            new Date(),
          );
          await this.assertSubmissionAttachmentCapacity(
            tx,
            editable.id,
            uploaded.length,
          );

          const attachments: SafeSubmissionAttachmentResponse[] = [];
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
              select: { id: true },
            });
            const attachment = await tx.submissionAttachment.create({
              data: {
                submissionId: editable.id,
                fileId: fileAsset.id,
              },
              select: safeAttachmentSelect,
            });
            attachments.push(mapSubmissionAttachmentResponse(attachment));
          }

          await tx.taskSubmission.update({
            where: { id: editable.id },
            data: { lastEditedById: viewer.userId },
            select: { id: true },
          });
          await writeActivity(tx, {
            actorId: viewer.userId,
            action: SUBMISSION_ACTIVITY.SUBMISSION_ATTACHMENTS_ADDED,
            entityType: 'SUBMISSION',
            entityId: editable.id,
            metadata: {
              version: editable.version,
              fileCount: uploaded.length,
              deadlineOverride: editable.deadlineOverride,
            },
          });

          return attachments;
        },
        { timeoutMs: SUBMISSION_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      await this.getStorage().destroyUploadedBestEffort(
        uploaded,
        'submission attachment edit rollback',
      );
      throw error;
    }
  }

  async deleteSubmissionAttachment(
    viewer: OperixViewer,
    submissionId: string,
    fileId: string,
  ): Promise<{ id: string }> {
    const deleted = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const editable = await this.resolveEditableSubmission(
          tx,
          viewer,
          submissionId,
          new Date(),
        );
        const attachment = await tx.submissionAttachment.findFirst({
          where: {
            submissionId: editable.id,
            file: { publicId: fileId },
          },
          select: {
            id: true,
            fileId: true,
            file: { select: { publicId: true, storageKey: true } },
          },
        });
        if (!attachment) throw this.fileNotFound();

        this.getStorage().assertEnabled();
        const [taskAttachmentCount, submissionAttachmentCount] =
          await Promise.all([
            tx.taskAttachment.count({ where: { fileId: attachment.fileId } }),
            tx.submissionAttachment.count({
              where: { fileId: attachment.fileId },
            }),
          ]);
        if (taskAttachmentCount !== 0 || submissionAttachmentCount !== 1) {
          this.logger.error(
            `FileAsset ${attachment.fileId} has invalid attachment references.`,
          );
          throw new AppException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
            'File attachment integrity violation.',
          );
        }

        await tx.submissionAttachment.delete({
          where: { id: attachment.id },
        });
        await tx.fileAsset.delete({ where: { id: attachment.fileId } });
        await tx.taskSubmission.update({
          where: { id: editable.id },
          data: { lastEditedById: viewer.userId },
          select: { id: true },
        });
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: SUBMISSION_ACTIVITY.SUBMISSION_ATTACHMENT_REMOVED,
          entityType: 'SUBMISSION',
          entityId: editable.id,
          metadata: {
            version: editable.version,
            deadlineOverride: editable.deadlineOverride,
          },
        });

        return {
          id: attachment.file.publicId,
          storageKey: attachment.file.storageKey,
        };
      },
      { timeoutMs: SUBMISSION_TRANSACTION_TIMEOUT_MS },
    );

    try {
      await this.getStorage().destroy(deleted.storageKey);
    } catch (error) {
      this.logger.warn(
        `Storage cleanup failed after Submission attachment delete ${fileId}: ${getErrorName(error)}`,
      );
    }

    return { id: deleted.id };
  }

  async listSubmissionAttachments(
    viewer: OperixViewer,
    submissionId: string,
  ): Promise<SafeSubmissionAttachmentResponse[]> {
    const submission = await this.prisma.taskSubmission.findFirst({
      where: {
        publicId: submissionId,
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
        submissionId: submission.id,
      },
      select: safeAttachmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return attachments.map(mapSubmissionAttachmentResponse);
  }

  private async assertSubmissionPrecheck(
    viewer: OperixViewer,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: {
        publicId: taskId,
        assignments: {
          some: {
            responsibleUserId: viewer.userId,
            unassignedAt: null,
          },
        },
      },
      select: {
        id: true,
        status: true,
        completionMode: true,
        reviewerUserId: true,
      },
    });

    if (!task) {
      throw this.taskNotFound();
    }

    if (task.completionMode === TaskCompletionMode.DIRECT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TASK_ERROR_CODE.TASK_DIRECT_COMPLETION_REQUIRED,
        'Direct tasks must be completed through the completion action.',
      );
    }

    if (!task.reviewerUserId) {
      throw this.submissionNotAllowed();
    }

    if (
      task.status !== TaskStatus.IN_PROGRESS &&
      task.status !== TaskStatus.REVISION_REQUIRED
    ) {
      throw this.submissionNotAllowed();
    }
  }

  private async resolveEditableSubmission(
    client: Pick<PrismaTransactionClient, 'taskSubmission'>,
    viewer: OperixViewer,
    submissionId: string,
    now: Date,
  ) {
    const submission = await client.taskSubmission.findFirst({
      where: { publicId: submissionId },
      select: {
        id: true,
        publicId: true,
        taskId: true,
        submittedById: true,
        version: true,
        submissionText: true,
        reviews: { take: 1, select: { id: true } },
        task: {
          select: {
            status: true,
            dueAt: true,
            assignments: {
              where: { unassignedAt: null },
              take: 2,
              select: { responsibleUserId: true },
            },
          },
        },
      },
    });
    if (!submission) throw this.submissionNotFound();

    if (submission.task.assignments.length > 1) {
      this.logger.error(
        `Task ${submission.taskId} has multiple active assignments during Submission edit.`,
      );
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
        'Task assignment integrity violation.',
      );
    }

    const superAdminOverride = viewer.role === UserRole.SUPER_ADMIN;
    const currentResponsibleUserId =
      submission.task.assignments[0]?.responsibleUserId ?? null;
    if (
      !superAdminOverride &&
      (submission.submittedById !== viewer.userId ||
        currentResponsibleUserId !== viewer.userId)
    ) {
      throw this.forbidden();
    }

    if (
      submission.task.status !== TaskStatus.SUBMITTED &&
      submission.task.status !== TaskStatus.RESUBMITTED
    ) {
      throw this.submissionNotEditable();
    }
    const latest = await client.taskSubmission.findFirst({
      where: { taskId: submission.taskId },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (latest?.id !== submission.id || submission.reviews.length > 0) {
      throw this.submissionNotEditable();
    }

    const deadlinePassed =
      submission.task.dueAt !== null && now >= submission.task.dueAt;
    if (deadlinePassed && !superAdminOverride) {
      throw new AppException(
        HttpStatus.CONFLICT,
        SUBMISSION_ERROR_CODE.SUBMISSION_EDIT_DEADLINE_PASSED,
        'Submission editing is locked after the Task deadline.',
      );
    }

    return {
      ...submission,
      deadlineOverride: superAdminOverride && deadlinePassed,
    };
  }

  private async assertSubmissionAttachmentCapacity(
    client: Pick<PrismaTransactionClient, 'submissionAttachment'>,
    submissionId: string,
    incomingCount: number,
  ): Promise<void> {
    const count = await client.submissionAttachment.count({
      where: { submissionId },
    });
    if (count + incomingCount > MAX_ATTACHMENT_FILES) {
      throw new AppException(
        HttpStatus.CONFLICT,
        SUBMISSION_ERROR_CODE.SUBMISSION_ATTACHMENT_LIMIT_REACHED,
        'Submission attachment limit reached.',
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

  private submissionNotEditable(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      SUBMISSION_ERROR_CODE.SUBMISSION_NOT_EDITABLE,
      'Submission can no longer be changed.',
    );
  }

  private forbidden(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this action.',
    );
  }

  private fileNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      APP_ERROR_CODE.FILE_NOT_FOUND,
      'File not found.',
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

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
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
