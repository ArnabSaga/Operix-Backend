import type {
  SafeAttachmentResponse,
  SafeAttachmentSource,
  SafeSubmissionAttachmentResponse,
} from './file.interface.js';

export function mapAttachmentResponse(
  attachment: SafeAttachmentSource,
): SafeAttachmentResponse {
  return {
    id: attachment.publicId ?? attachment.file.publicId,
    file: {
      id: attachment.file.publicId,
      originalName: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes,
      uploadedById: attachment.file.uploadedBy.publicId,
      createdAt: attachment.file.createdAt,
    },
    downloadUrl: `/api/v1/files/${attachment.file.publicId}/download`,
  };
}

export function mapSubmissionAttachmentResponse(
  attachment: SafeAttachmentSource,
): SafeSubmissionAttachmentResponse {
  const mapped = mapAttachmentResponse(attachment);
  return { file: mapped.file, downloadUrl: mapped.downloadUrl };
}

export function buildContentDisposition(filename: string): string {
  const safeFilename = filename
    .replace(/[\r\n"\\/]/g, '_')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? '_' : character;
    })
    .join('')
    .trim();
  const fallback = safeFilename.length > 0 ? safeFilename : 'download';
  const encoded = encodeURIComponent(fallback).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
