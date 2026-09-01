import type { TaskReviewAction } from '../../../generated/prisma/enums.js';

export interface SafeReviewResponse {
  submissionId: string;
  reviewer: { id: string; name: string };
  action: TaskReviewAction;
  feedback: string | null;
  reviewedAt: Date;
  createdAt: Date;
}
