import { HttpStatus, Injectable } from '@nestjs/common';
import {
  TaskReviewAction,
  TaskStatus,
  UserRole,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import {
  REVIEW_ACTIVITY,
  REVIEW_ERROR_CODE,
  REVIEW_NOTIFICATION,
} from './review.constant.js';
import type { SafeReviewResponse } from './review.interface.js';
import { reviewSelect } from './review.select.js';
import { SUBMISSION_ERROR_CODE } from './submission.constant.js';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(
    viewer: OperixViewer,
    submissionId: string,
    dto: CreateReviewDto,
  ): Promise<SafeReviewResponse> {
    this.assertAdmin(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const submission = await tx.taskSubmission.findFirst({
        where: {
          id: submissionId,
          task: {
            team: {
              adminId: viewer.userId,
            },
          },
        },
        select: {
          id: true,
          taskId: true,
          submittedById: true,
          version: true,
          task: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!submission) {
        throw this.submissionNotFound();
      }

      const latestSubmission = await tx.taskSubmission.findFirst({
        where: {
          taskId: submission.taskId,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          id: true,
        },
      });

      if (latestSubmission?.id !== submission.id) {
        throw this.reviewNotAllowed();
      }

      const existingReview = await tx.taskReview.findFirst({
        where: {
          submissionId: submission.id,
        },
        select: {
          id: true,
        },
      });

      if (existingReview) {
        throw this.reviewNotAllowed();
      }

      if (
        submission.task.status !== TaskStatus.SUBMITTED &&
        submission.task.status !== TaskStatus.RESUBMITTED
      ) {
        throw this.reviewNotAllowed();
      }

      const reviewStartedAt = new Date();

      await tx.task.update({
        where: {
          id: submission.taskId,
        },
        data: {
          status: TaskStatus.UNDER_REVIEW,
        },
        select: {
          id: true,
        },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId: submission.taskId,
          fromStatus: submission.task.status,
          toStatus: TaskStatus.UNDER_REVIEW,
          changedById: viewer.userId,
          notes: 'Task review started.',
          changedAt: reviewStartedAt,
        },
      });

      const decisionAt = createMonotonicDecisionDate(reviewStartedAt);
      const review = await tx.taskReview.create({
        data: {
          submissionId: submission.id,
          reviewerId: viewer.userId,
          action: dto.action,
          feedback: dto.feedback ?? null,
          reviewedAt: decisionAt,
        },
        select: reviewSelect,
      });

      const finalStatus =
        dto.action === TaskReviewAction.APPROVE
          ? TaskStatus.COMPLETED
          : TaskStatus.REVISION_REQUIRED;

      await tx.task.update({
        where: {
          id: submission.taskId,
        },
        data: {
          status: finalStatus,
          completedAt:
            dto.action === TaskReviewAction.APPROVE ? decisionAt : undefined,
        },
        select: {
          id: true,
        },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId: submission.taskId,
          fromStatus: TaskStatus.UNDER_REVIEW,
          toStatus: finalStatus,
          changedById: viewer.userId,
          notes:
            dto.action === TaskReviewAction.APPROVE
              ? 'Task approved.'
              : 'Task revision requested.',
          changedAt: decisionAt,
        },
      });

      const activity =
        dto.action === TaskReviewAction.APPROVE
          ? REVIEW_ACTIVITY.TASK_APPROVED
          : REVIEW_ACTIVITY.TASK_REVISION_REQUESTED;

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: activity,
        entityType: 'TASK',
        entityId: submission.taskId,
        metadata: {
          taskId: submission.taskId,
          submissionId: submission.id,
          reviewId: review.id,
          version: submission.version,
          action: dto.action,
        },
      });

      await createNotification(tx, {
        receiverId: submission.submittedById,
        actorId: viewer.userId,
        type:
          dto.action === TaskReviewAction.APPROVE
            ? REVIEW_NOTIFICATION.TASK_APPROVED
            : REVIEW_NOTIFICATION.TASK_REVISION_REQUESTED,
        title:
          dto.action === TaskReviewAction.APPROVE
            ? 'Task approved'
            : 'Task revision requested',
        body:
          dto.action === TaskReviewAction.APPROVE
            ? 'Your task submission has been approved.'
            : 'Revision has been requested for your task submission.',
        targetType: 'SUBMISSION',
        targetId: submission.id,
      });

      return review;
    });
  }

  private assertAdmin(viewer: OperixViewer): void {
    if (viewer.role !== UserRole.ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private submissionNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
      'Submission not found.',
    );
  }

  private reviewNotAllowed(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
      'Submission is not reviewable.',
    );
  }
}

function createMonotonicDecisionDate(reviewStartedAt: Date): Date {
  const decisionAt = new Date();

  if (decisionAt.getTime() <= reviewStartedAt.getTime()) {
    return new Date(reviewStartedAt.getTime() + 1);
  }

  return decisionAt;
}
