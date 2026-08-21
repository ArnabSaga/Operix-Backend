import type { TaskReview } from '../../../generated/prisma/client.js';

export type SafeReviewResponse = Pick<
  TaskReview,
  | 'id'
  | 'submissionId'
  | 'reviewerId'
  | 'action'
  | 'feedback'
  | 'reviewedAt'
  | 'createdAt'
>;
