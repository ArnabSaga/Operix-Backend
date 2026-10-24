import { Injectable } from '@nestjs/common';
import {
  TaskReviewAction,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import { REVIEW_ACTIVITY, REVIEW_NOTIFICATION } from './review.constant.js';
import type { SafeReviewResponse } from './review.interface.js';
import { reviewSelect } from './review.select.js';
import {
  assertReviewAuthority,
  resolveReviewableSubmission,
} from './submission-review.policy.js';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(
    viewer: OperixViewer,
    submissionId: string,
    dto: CreateReviewDto,
  ): Promise<SafeReviewResponse> {
    assertReviewAuthority(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const submission = await resolveReviewableSubmission(
        tx,
        viewer,
        submissionId,
      );

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

      return {
        submissionId: review.submission.publicId,
        reviewer: { id: review.reviewer.publicId, name: review.reviewer.name },
        action: review.action,
        feedback: review.feedback,
        reviewedAt: review.reviewedAt,
        createdAt: review.createdAt,
      };
    });
  }
}

function createMonotonicDecisionDate(reviewStartedAt: Date): Date {
  const decisionAt = new Date();

  if (decisionAt.getTime() <= reviewStartedAt.getTime()) {
    return new Date(reviewStartedAt.getTime() + 1);
  }

  return decisionAt;
}
