import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  TaskCompletionMode,
  TaskStatus,
  UserRole,
} from '../../../generated/prisma/enums.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { REVIEW_ERROR_CODE } from './review.constant.js';
import { SUBMISSION_ERROR_CODE } from './submission.constant.js';

/**
 * Fields required to decide whether a Submission may be reviewed and to give
 * the reviewer enough context to act on it.
 *
 * Only operational data is selected here. Attachment storage details and any
 * other private identifier stay out of this shape on purpose, so callers cannot
 * leak them by accident.
 */
export const reviewableSubmissionSelect = {
  id: true,
  publicId: true,
  taskId: true,
  submittedById: true,
  version: true,
  submissionText: true,
  submittedAt: true,
  task: {
    select: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      remarks: true,
      priority: true,
      status: true,
      dueAt: true,
      completionMode: true,
      team: { select: { adminId: true, publicId: true, name: true } },
    },
  },
} satisfies Prisma.TaskSubmissionSelect;

export type ReviewableSubmission = Prisma.TaskSubmissionGetPayload<{
  select: typeof reviewableSubmissionSelect;
}>;

/**
 * Narrow client surface accepted by the policy. Both the root Prisma client and
 * an interactive transaction satisfy it, so the same rules can run inside the
 * review transaction and outside it for read-only analysis.
 */
export type SubmissionReviewClient = Pick<
  PrismaService,
  'taskSubmission' | 'taskReview'
>;

/**
 * Exactly the review authority the workflow grants: an Admin whose Team
 * administers the Task. Super Admin and Member are denied deliberately, because
 * neither can create a Review.
 */
export function assertReviewAuthority(viewer: OperixViewer): void {
  if (viewer.role !== UserRole.ADMIN) {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this resource.',
    );
  }
}

/**
 * Resolves the Submission a reviewer may act on right now, or throws the same
 * stable errors the review workflow already exposes.
 *
 * Order is part of the contract: a missing or foreign Submission is masked as
 * `SUBMISSION_NOT_FOUND`, while a real but non-actionable Submission is
 * `REVIEW_NOT_ALLOWED`. Callers that only read (for example the AI assistant)
 * reuse this function so their authority can never drift from the real one.
 */
export async function resolveReviewableSubmission(
  client: SubmissionReviewClient,
  viewer: OperixViewer,
  submissionId: string,
): Promise<ReviewableSubmission> {
  const submission = await client.taskSubmission.findFirst({
    where: {
      publicId: submissionId,
    },
    select: reviewableSubmissionSelect,
  });

  if (!submission) {
    throw submissionNotFound();
  }

  if (
    submission.task.completionMode === TaskCompletionMode.DIRECT ||
    submission.task.team === null
  ) {
    throw reviewNotAllowed();
  }

  if (submission.task.team.adminId !== viewer.userId) {
    throw submissionNotFound();
  }

  const latestSubmission = await client.taskSubmission.findFirst({
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
    throw reviewNotAllowed();
  }

  const existingReview = await client.taskReview.findFirst({
    where: {
      submissionId: submission.id,
    },
    select: {
      id: true,
    },
  });

  if (existingReview) {
    throw reviewNotAllowed();
  }

  if (
    submission.task.status !== TaskStatus.SUBMITTED &&
    submission.task.status !== TaskStatus.RESUBMITTED
  ) {
    throw reviewNotAllowed();
  }

  return submission;
}

function submissionNotFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
    'Submission not found.',
  );
}

function reviewNotAllowed(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
    'Submission is not reviewable.',
  );
}
