import type {
  SafeAttachmentResponse,
  SafeAttachmentSource,
} from './file.interface.js';

export function mapAttachmentResponse(
  attachment: SafeAttachmentSource,
): SafeAttachmentResponse {
  return {
    id: attachment.id,
    file: {
      id: attachment.file.id,
      originalName: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes,
      uploadedById: attachment.file.uploadedById,
      createdAt: attachment.file.createdAt,
    },
    downloadUrl: `/api/v1/files/${attachment.file.id}/download`,
  };
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
