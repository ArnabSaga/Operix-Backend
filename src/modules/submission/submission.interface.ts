import type { TaskSubmission } from '../../../generated/prisma/client.js';
import type { SafeAttachmentResponse } from '../file/file.interface.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export type SafeSubmissionBaseResponse = Pick<
  TaskSubmission,
  | 'id'
  | 'taskId'
  | 'submittedById'
  | 'version'
  | 'submissionText'
  | 'submittedAt'
  | 'createdAt'
>;

export interface SafeSubmissionResponse extends SafeSubmissionBaseResponse {
  attachments?: SafeAttachmentResponse[];
}
export interface PaginatedSubmissionResponse {
  data: SafeSubmissionResponse[];
  meta: PaginationMeta;
}
