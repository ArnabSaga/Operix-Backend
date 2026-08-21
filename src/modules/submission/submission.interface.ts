import type { TaskSubmission } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export type SafeSubmissionResponse = Pick<
  TaskSubmission,
  | 'id'
  | 'taskId'
  | 'submittedById'
  | 'version'
  | 'submissionText'
  | 'submittedAt'
  | 'createdAt'
>;

export interface PaginatedSubmissionResponse {
  data: SafeSubmissionResponse[];
  meta: PaginationMeta;
}
