import { mapAttachmentResponse } from '../file/file.mapper.js';
import type { SafeSubmissionResponse } from './submission.interface.js';

export interface SubmissionResponseSource {
  id: string;
  taskId: string;
  submittedById: string;
  version: number;
  submissionText: string | null;
  submittedAt: Date;
  createdAt: Date;
  attachments?: {
    id: string;
    file: {
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      uploadedById: string;
      createdAt: Date;
    };
  }[];
}

export function mapSubmissionResponse(
  submission: SubmissionResponseSource,
): SafeSubmissionResponse {
  if (submission.attachments === undefined) {
    return submission as SafeSubmissionResponse;
  }

  return {
    id: submission.id,
    taskId: submission.taskId,
    submittedById: submission.submittedById,
    version: submission.version,
    submissionText: submission.submissionText,
    submittedAt: submission.submittedAt,
    createdAt: submission.createdAt,
    attachments: submission.attachments.map(mapAttachmentResponse),
  };
}
