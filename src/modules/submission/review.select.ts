import type { Prisma } from '../../../generated/prisma/client.js';

export const reviewSelect = {
  id: true,
  submission: { select: { publicId: true } },
  reviewer: { select: { publicId: true, name: true } },
  action: true,
  feedback: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.TaskReviewSelect;
