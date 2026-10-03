import { mapSubmissionAttachmentResponse } from '../file/file.mapper.js';
import type { SafeSubmissionResponse } from './submission.interface.js';
import type { UserRole } from '../../../generated/prisma/enums.js';

export interface SubmissionResponseSource {
  id: string;
  publicId: string;
  taskId: string;
  submittedById: string;
  task: { publicId: string };
  submittedBy: {
    publicId: string;
    name?: string;
    role?: UserRole;
    employeeId?: string | null;
    designation?: string | null;
  } | null;
  version: number;
  submissionText: string | null;
  submittedAt: Date;
  createdAt: Date;
  attachments?: {
    id: string;
    file: {
      id: string;
      publicId: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      uploadedById: string;
      uploadedBy: { publicId: string; name: string };
      createdAt: Date;
    };
  }[];
}

export function mapSubmissionResponse(
  submission: SubmissionResponseSource,
): SafeSubmissionResponse {
  return {
    id: submission.publicId,
    taskId: submission.task?.publicId ?? '',
    submittedById: submission.submittedBy?.publicId ?? submission.submittedById,
    submittedBy: submission.submittedBy
      ? {
          id: submission.submittedBy.publicId,
          name: submission.submittedBy.name ?? 'Unknown member',
          role: submission.submittedBy.role,
          employeeId: submission.submittedBy.employeeId ?? null,
          designation: submission.submittedBy.designation ?? null,
        }
      : null,
    version: submission.version,
    submissionText: submission.submissionText,
    submittedAt: submission.submittedAt,
    createdAt: submission.createdAt,
    attachments: submission.attachments
      ? submission.attachments.map(mapSubmissionAttachmentResponse)
      : [],
  };
}
