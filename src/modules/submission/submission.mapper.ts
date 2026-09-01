import { mapSubmissionAttachmentResponse } from '../file/file.mapper.js';
import type { SafeSubmissionResponse } from './submission.interface.js';

export interface SubmissionResponseSource {
  id: string;
  publicId: string;
  taskId: string;
  submittedById: string;
  task: { publicId: string };
  submittedBy: { publicId: string };
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
      uploadedBy: { publicId: string };
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
    id: submission.publicId,
    taskId: submission.task.publicId,
    submittedById: submission.submittedBy.publicId,
    version: submission.version,
    submissionText: submission.submissionText,
    submittedAt: submission.submittedAt,
    createdAt: submission.createdAt,
    attachments: submission.attachments.map(mapSubmissionAttachmentResponse),
  };
}
