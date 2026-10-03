import type { TaskSubmission } from '../../../generated/prisma/client.js';
import type { UserRole } from '../../../generated/prisma/enums.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
import type { SafeSubmissionAttachmentResponse } from '../file/file.interface.js';

export interface SafeSubmissionUserResponse {
  id: string;
  name: string;
  role?: UserRole;
  employeeId?: string | null;
  designation?: string | null;
}

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
  submittedBy?: SafeSubmissionUserResponse | null;
  attachments?: SafeSubmissionAttachmentResponse[];
}
export interface PaginatedSubmissionResponse {
  data: SafeSubmissionResponse[];
  meta: PaginationMeta;
}
