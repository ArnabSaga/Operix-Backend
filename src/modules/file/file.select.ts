export const safeFileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  createdAt: true,
} as const;

export const safeAttachmentSelect = {
  id: true,
  file: {
    select: safeFileSelect,
  },
} as const;
