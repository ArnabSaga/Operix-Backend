import { DocumentSource } from './document.constant.js';
import type {
  DocumentListItem,
  DocumentResponseSource,
} from './document.interface.js';

/**
 * Maps one FileAsset row to a safe public Document. Source precedence is
 * deterministic: a Submission link wins over a Task link when both somehow
 * exist, otherwise the single linked source is used. Callers guarantee the
 * row passed the legitimate-document predicate, so at least one source is
 * present; a source-less row maps to null and must be filtered out.
 */
export function mapDocumentResponse(
  document: DocumentResponseSource,
): DocumentListItem | null {
  const submissionAttachment = document.submissionAttachments[0];
  if (submissionAttachment) {
    return {
      id: document.publicId,
      name: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.createdAt,
      uploadedBy: {
        id: document.uploadedBy.publicId,
        name: document.uploadedBy.name,
      },
      source: {
        type: DocumentSource.SUBMISSION_ATTACHMENT,
        task: {
          id: submissionAttachment.submission.task.publicId,
          title: submissionAttachment.submission.task.title,
        },
        submission: {
          id: submissionAttachment.submission.publicId,
          version: submissionAttachment.submission.version,
        },
      },
      downloadUrl: `/api/v1/files/${document.publicId}/download`,
    };
  }

  const taskAttachment = document.taskAttachments[0];
  if (taskAttachment) {
    return {
      id: document.publicId,
      name: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.createdAt,
      uploadedBy: {
        id: document.uploadedBy.publicId,
        name: document.uploadedBy.name,
      },
      source: {
        type: DocumentSource.TASK_ATTACHMENT,
        task: {
          id: taskAttachment.task.publicId,
          title: taskAttachment.task.title,
        },
        submission: null,
      },
      downloadUrl: `/api/v1/files/${document.publicId}/download`,
    };
  }

  return null;
}
