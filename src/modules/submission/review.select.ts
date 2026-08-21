import type { Prisma } from '../../../generated/prisma/client.js';

export const reviewSelect = {
  id: true,
  submissionId: true,
  reviewerId: true,
  action: true,
  feedback: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.TaskReviewSelect;
