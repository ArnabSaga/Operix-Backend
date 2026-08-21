/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { PrismaService } from '../../../src/database/prisma.service';
import { CreateReviewDto } from '../../../src/modules/submission/dto/create-review.dto';
import {
  REVIEW_ACTIVITY,
  REVIEW_ERROR_CODE,
  REVIEW_NOTIFICATION,
} from '../../../src/modules/submission/review.constant';
import type { SafeReviewResponse } from '../../../src/modules/submission/review.interface';
import { ReviewService } from '../../../src/modules/submission/review.service';
import { SUBMISSION_ERROR_CODE } from '../../../src/modules/submission/submission.constant';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import {
  TaskReviewAction,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';

const jestApi = import.meta.jest;

const fixedDate = new Date('2026-08-21T10:00:00.000Z');

function createViewer(role: UserRole = UserRole.ADMIN): OperixViewer {
  return {
    userId:
      role === UserRole.ADMIN
        ? 'admin-a'
        : role === UserRole.MEMBER
          ? 'member-a'
          : 'chief-a',
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

function createReview(
  overrides: Partial<SafeReviewResponse> = {},
): SafeReviewResponse {
  return {
    id: 'review-a',
    submissionId: 'submission-a',
    reviewerId: 'admin-a',
    action: TaskReviewAction.APPROVE,
    feedback: null,
    reviewedAt: fixedDate,
    createdAt: fixedDate,
    ...overrides,
  };
}

function createSubmissionRecord(
  overrides: {
    id?: string;
    version?: number;
    status?: TaskStatus;
    submittedById?: string;
  } = {},
) {
  return {
    id: overrides.id ?? 'submission-a',
    taskId: 'task-a',
    submittedById: overrides.submittedById ?? 'member-a',
    version: overrides.version ?? 1,
    task: {
      id: 'task-a',
      status: overrides.status ?? TaskStatus.SUBMITTED,
    },
  };
}

function createTx(
  input: {
    submission?: Awaited<ReturnType<typeof createSubmissionRecord>> | null;
    latestSubmission?: { id: string } | null;
    existingReview?: { id: string } | null;
    review?: SafeReviewResponse;
  } = {},
) {
  return {
    taskSubmission: {
      findFirst: jestApi
        .fn()
        .mockResolvedValueOnce(
          Object.hasOwn(input, 'submission')
            ? input.submission
            : createSubmissionRecord(),
        )
        .mockResolvedValueOnce(
          input.latestSubmission ?? { id: 'submission-a' },
        ),
    },
    taskReview: {
      findFirst: jestApi.fn().mockResolvedValue(input.existingReview ?? null),
      create: jestApi.fn().mockResolvedValue(input.review ?? createReview()),
    },
    task: {
      update: jestApi.fn().mockResolvedValue({ id: 'task-a' }),
    },
    taskStatusHistory: {
      create: jestApi.fn().mockResolvedValue({ id: 'history-a' }),
    },
    activityLog: {
      create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
    },
    notification: {
      create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
    },
  };
}

function createService(tx: ReturnType<typeof createTx>) {
  const transaction = jestApi.fn(
    (callback: (transaction: ReturnType<typeof createTx>) => unknown) =>
      callback(tx),
  );
  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    service: new ReviewService(prisma),
    prisma,
    transaction,
  };
}

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

async function expectRejectsAppException(
  promise: Promise<unknown>,
  input: {
    status: number;
    code: string;
  },
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject.');
  } catch (error) {
    expectAppException(error, input);
  }
}

describe('CreateReviewDto', () => {
  it('requires revision feedback and rejects whitespace approval feedback', () => {
    const missingRevision = plainToInstance(CreateReviewDto, {
      action: TaskReviewAction.REQUEST_REVISION,
    });
    const blankRevision = plainToInstance(CreateReviewDto, {
      action: TaskReviewAction.REQUEST_REVISION,
      feedback: '   ',
    });
    const blankApproval = plainToInstance(CreateReviewDto, {
      action: TaskReviewAction.APPROVE,
      feedback: '   ',
    });
    const approvalWithoutFeedback = plainToInstance(CreateReviewDto, {
      action: TaskReviewAction.APPROVE,
    });

    expect(validateSync(missingRevision)).toHaveLength(1);
    expect(validateSync(blankRevision)).toHaveLength(1);
    expect(validateSync(blankApproval)).toHaveLength(1);
    expect(validateSync(approvalWithoutFeedback)).toHaveLength(0);
  });
});

describe('ReviewService', () => {
  it('approves a latest submitted submission with real review transitions', async () => {
    const review = createReview();
    const tx = createTx({ review });
    const { service } = createService(tx);

    const result = await service.createReview(createViewer(), 'submission-a', {
      action: TaskReviewAction.APPROVE,
    });

    expect(result).toBe(review);
    expect(tx.taskSubmission.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'submission-a',
          task: {
            team: {
              adminId: 'admin-a',
            },
          },
        },
      }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          status: TaskStatus.UNDER_REVIEW,
        },
      }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: TaskStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: TaskStatus.SUBMITTED,
          toStatus: TaskStatus.UNDER_REVIEW,
          changedById: 'admin-a',
          changedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: TaskStatus.UNDER_REVIEW,
          toStatus: TaskStatus.COMPLETED,
          changedById: 'admin-a',
          changedAt: expect.any(Date),
        }),
      }),
    );
    expect(
      tx.taskStatusHistory.create.mock.calls[1][0].data.changedAt.getTime(),
    ).toBeGreaterThanOrEqual(
      tx.taskStatusHistory.create.mock.calls[0][0].data.changedAt.getTime(),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: REVIEW_ACTIVITY.TASK_APPROVED,
          actorId: 'admin-a',
          entityId: 'task-a',
          metadata: expect.objectContaining({
            taskId: 'task-a',
            submissionId: 'submission-a',
            reviewId: 'review-a',
            version: 1,
            action: TaskReviewAction.APPROVE,
          }),
        }),
      }),
    );
    expect(
      tx.activityLog.create.mock.calls[0][0].data.metadata,
    ).not.toHaveProperty('feedback');
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiverId: 'member-a',
          actorId: 'admin-a',
          type: REVIEW_NOTIFICATION.TASK_APPROVED,
          targetType: 'SUBMISSION',
          targetId: 'submission-a',
        }),
      }),
    );
  });

  it('approves a latest resubmitted submission', async () => {
    const tx = createTx({
      submission: createSubmissionRecord({
        version: 2,
        status: TaskStatus.RESUBMITTED,
      }),
      review: createReview({
        action: TaskReviewAction.APPROVE,
      }),
    });
    const { service } = createService(tx);

    await service.createReview(createViewer(), 'submission-a', {
      action: TaskReviewAction.APPROVE,
    });

    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: TaskStatus.RESUBMITTED,
          toStatus: TaskStatus.UNDER_REVIEW,
        }),
      }),
    );
    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: TaskStatus.COMPLETED,
        }),
      }),
    );
  });

  it('requests revision and leaves completion fields untouched', async () => {
    const tx = createTx({
      review: createReview({
        action: TaskReviewAction.REQUEST_REVISION,
        feedback: 'Please correct the figures.',
      }),
    });
    const { service } = createService(tx);

    await service.createReview(createViewer(), 'submission-a', {
      action: TaskReviewAction.REQUEST_REVISION,
      feedback: 'Please correct the figures.',
    });

    expect(tx.taskReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: TaskReviewAction.REQUEST_REVISION,
          feedback: 'Please correct the figures.',
        }),
      }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          status: TaskStatus.REVISION_REQUIRED,
          completedAt: undefined,
        },
      }),
    );
    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: TaskStatus.UNDER_REVIEW,
          toStatus: TaskStatus.REVISION_REQUIRED,
        }),
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: REVIEW_ACTIVITY.TASK_REVISION_REQUESTED,
        }),
      }),
    );
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiverId: 'member-a',
          type: REVIEW_NOTIFICATION.TASK_REVISION_REQUESTED,
          targetType: 'SUBMISSION',
          targetId: 'submission-a',
        }),
      }),
    );
  });

  it('requests another revision from a resubmitted submission', async () => {
    const tx = createTx({
      submission: createSubmissionRecord({
        version: 2,
        status: TaskStatus.RESUBMITTED,
      }),
      review: createReview({
        action: TaskReviewAction.REQUEST_REVISION,
      }),
    });
    const { service } = createService(tx);

    await service.createReview(createViewer(), 'submission-a', {
      action: TaskReviewAction.REQUEST_REVISION,
      feedback: 'Please revise again.',
    });

    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: TaskStatus.RESUBMITTED,
          toStatus: TaskStatus.UNDER_REVIEW,
        }),
      }),
    );
    expect(tx.taskStatusHistory.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: TaskStatus.REVISION_REQUIRED,
        }),
      }),
    );
  });

  it('rejects wrong roles before opening a transaction', async () => {
    const tx = createTx();
    const { service, transaction } = createService(tx);

    await expectRejectsAppException(
      service.createReview(createViewer(UserRole.SUPER_ADMIN), 'submission-a', {
        action: TaskReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      },
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns submission not found for missing or out-of-scope submissions', async () => {
    const tx = createTx({ submission: null });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.createReview(createViewer(), 'missing-submission', {
        action: TaskReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.NOT_FOUND,
        code: SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
      },
    );
  });

  it('rejects stale submissions', async () => {
    const tx = createTx({
      submission: createSubmissionRecord({
        id: 'submission-v1',
        version: 1,
      }),
      latestSubmission: {
        id: 'submission-v2',
      },
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.createReview(createViewer(), 'submission-v1', {
        action: TaskReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.CONFLICT,
        code: REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
      },
    );
  });

  it('rejects submissions with an existing review', async () => {
    const tx = createTx({
      existingReview: {
        id: 'review-existing',
      },
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.createReview(createViewer(), 'submission-a', {
        action: TaskReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.CONFLICT,
        code: REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
      },
    );
  });

  it.each([
    TaskStatus.PENDING,
    TaskStatus.ASSIGNED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.UNDER_REVIEW,
    TaskStatus.REVISION_REQUIRED,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
  ])('rejects invalid task state %s', async (status) => {
    const tx = createTx({
      submission: createSubmissionRecord({
        status,
      }),
    });
    const { service } = createService(tx);

    await expectRejectsAppException(
      service.createReview(createViewer(), 'submission-a', {
        action: TaskReviewAction.APPROVE,
      }),
      {
        status: HttpStatus.CONFLICT,
        code: REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
      },
    );
  });
});
