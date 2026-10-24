import { HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../../../src/database/prisma.service';
import { ReviewService } from '../../../src/modules/submission/review.service';
import {
  assertReviewAuthority,
  resolveReviewableSubmission,
} from '../../../src/modules/submission/submission-review.policy';
import type { SubmissionReviewClient } from '../../../src/modules/submission/submission-review.policy';
import { REVIEW_ERROR_CODE } from '../../../src/modules/submission/review.constant';
import { SUBMISSION_ERROR_CODE } from '../../../src/modules/submission/submission.constant';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskReviewAction,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;

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

interface SubmissionOverrides {
  status?: TaskStatus;
  completionMode?: TaskCompletionMode;
  teamAdminId?: string | null;
  version?: number;
}

function createSubmission(overrides: SubmissionOverrides = {}) {
  return {
    id: 'submission-internal-a',
    publicId: 'submission-a',
    taskId: 'task-internal-a',
    submittedById: 'member-a',
    version: overrides.version ?? 1,
    submissionText: 'Completed the assigned workload.',
    submittedAt: fixedDate,
    task: {
      id: 'task-internal-a',
      publicId: 'task-a',
      title: 'Prepare batch record',
      description: 'Review the batch record.',
      remarks: null,
      priority: TaskPriority.MEDIUM,
      status: overrides.status ?? TaskStatus.SUBMITTED,
      dueAt: null,
      completionMode:
        overrides.completionMode ?? TaskCompletionMode.REVIEW_REQUIRED,
      team:
        overrides.teamAdminId === null
          ? null
          : { adminId: overrides.teamAdminId ?? 'admin-a' },
    },
  };
}

interface ClientInput {
  submission?: ReturnType<typeof createSubmission> | null;
  latest?: { id: string } | null;
  existingReview?: { id: string } | null;
}

function createClient(input: ClientInput = {}) {
  const submission = Object.hasOwn(input, 'submission')
    ? input.submission
    : createSubmission();
  const latest = Object.hasOwn(input, 'latest')
    ? input.latest
    : { id: 'submission-internal-a' };
  const existingReview = input.existingReview ?? null;

  return {
    taskSubmission: {
      findFirst: jestApi
        .fn()
        .mockResolvedValueOnce(submission)
        .mockResolvedValueOnce(latest),
    },
    taskReview: {
      findFirst: jestApi.fn().mockResolvedValue(existingReview),
    },
  };
}

/** The policy only reads, so a structural double is enough at runtime. */
function asPolicyClient(
  client: ReturnType<typeof createClient>,
): SubmissionReviewClient {
  return client as unknown as SubmissionReviewClient;
}

function createReviewService(client: ReturnType<typeof createClient>) {
  const transaction = jestApi.fn((callback: (tx: unknown) => unknown) =>
    callback(client),
  );
  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  return new ReviewService(prisma);
}

function readError(error: unknown): { status: number; code: string } {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => { code?: string };
  };

  return {
    status: exception.getStatus(),
    code: exception.getResponse().code ?? 'unknown',
  };
}

async function captureError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return readError(error);
  }

  throw new Error('Expected the operation to fail.');
}

const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  code: APP_ERROR_CODE.FORBIDDEN,
};

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  code: SUBMISSION_ERROR_CODE.SUBMISSION_NOT_FOUND,
};

const NOT_ALLOWED = {
  status: HttpStatus.CONFLICT,
  code: REVIEW_ERROR_CODE.REVIEW_NOT_ALLOWED,
};

describe('assertReviewAuthority', () => {
  it('accepts only Admins, matching the real review guard', () => {
    expect(() =>
      assertReviewAuthority(createViewer(UserRole.ADMIN)),
    ).not.toThrow();

    expect(() =>
      assertReviewAuthority(createViewer(UserRole.SUPER_ADMIN)),
    ).toThrow();
    expect(() =>
      assertReviewAuthority(createViewer(UserRole.MEMBER)),
    ).toThrow();
  });
});

interface Scenario {
  name: string;
  viewer: OperixViewer;
  input: ClientInput;
  expected: { status: number; code: string };
}

const deniedScenarios: Scenario[] = [
  {
    name: 'unknown submission',
    viewer: createViewer(),
    input: { submission: null },
    expected: NOT_FOUND,
  },
  {
    name: 'another Team Admin',
    viewer: createViewer(),
    input: { submission: createSubmission({ teamAdminId: 'admin-b' }) },
    expected: NOT_FOUND,
  },
  {
    name: 'direct completion Task',
    viewer: createViewer(),
    input: {
      submission: createSubmission({
        completionMode: TaskCompletionMode.DIRECT,
      }),
    },
    expected: NOT_ALLOWED,
  },
  {
    name: 'Task without a Team',
    viewer: createViewer(),
    input: { submission: createSubmission({ teamAdminId: null }) },
    expected: NOT_ALLOWED,
  },
  {
    name: 'superseded Submission version',
    viewer: createViewer(),
    input: {
      submission: createSubmission({ version: 1 }),
      latest: { id: 'submission-internal-b' },
    },
    expected: NOT_ALLOWED,
  },
  {
    name: 'Submission that already has a Review',
    viewer: createViewer(),
    input: { existingReview: { id: 'review-a' } },
    expected: NOT_ALLOWED,
  },
  {
    name: 'Task waiting for the Member to start',
    viewer: createViewer(),
    input: { submission: createSubmission({ status: TaskStatus.IN_PROGRESS }) },
    expected: NOT_ALLOWED,
  },
];

describe('resolveReviewableSubmission', () => {
  it('resolves the current actionable Submission for its Team Admin', async () => {
    const client = createClient();
    const submission = await resolveReviewableSubmission(
      asPolicyClient(client),
      createViewer(),
      'submission-a',
    );

    expect(submission.publicId).toBe('submission-a');
    expect(client.taskSubmission.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { publicId: 'submission-a' } }),
    );
    expect(client.taskSubmission.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { taskId: 'task-internal-a' },
        orderBy: { version: 'desc' },
      }),
    );
    expect(client.taskReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'submission-internal-a' },
      }),
    );
  });

  it('allows RESUBMITTED Tasks as well', async () => {
    const client = createClient({
      submission: createSubmission({ status: TaskStatus.RESUBMITTED }),
    });

    await expect(
      resolveReviewableSubmission(
        asPolicyClient(client),
        createViewer(),
        'submission-a',
      ),
    ).resolves.toMatchObject({ publicId: 'submission-a' });
  });

  it.each(deniedScenarios)(
    'denies $name with the documented error',
    async (scenario) => {
      const client = createClient(scenario.input);

      const readOnlyError = await captureError(() =>
        resolveReviewableSubmission(
          asPolicyClient(client),
          scenario.viewer,
          'submission-a',
        ),
      );

      expect(readOnlyError).toEqual(scenario.expected);
    },
  );

  it.each(deniedScenarios)(
    'matches ReviewService authority for $name',
    async (scenario) => {
      const readOnlyError = await captureError(() =>
        resolveReviewableSubmission(
          asPolicyClient(createClient(scenario.input)),
          scenario.viewer,
          'submission-a',
        ),
      );

      const reviewService = createReviewService(createClient(scenario.input));
      const mutationError = await captureError(() =>
        reviewService.createReview(scenario.viewer, 'submission-a', {
          action: TaskReviewAction.APPROVE,
        }),
      );

      expect(mutationError).toEqual(readOnlyError);
    },
  );
});

describe('non-Admin callers', () => {
  it.each([UserRole.SUPER_ADMIN, UserRole.MEMBER])(
    'is rejected by assertReviewAuthority with FORBIDDEN for %s',
    (role) => {
      let error: unknown;

      try {
        assertReviewAuthority(createViewer(role));
      } catch (caught) {
        error = caught;
      }

      expect(readError(error)).toEqual(FORBIDDEN);
    },
  );

  it.each([UserRole.SUPER_ADMIN, UserRole.MEMBER])(
    'never resolves a Submission for %s, even when the policy is called directly',
    async (role) => {
      const error = await captureError(() =>
        resolveReviewableSubmission(
          asPolicyClient(createClient()),
          createViewer(role),
          'submission-a',
        ),
      );

      expect(error).toEqual(NOT_FOUND);
    },
  );
});
