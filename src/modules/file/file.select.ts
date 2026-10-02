export const safeFileSelect = {
  id: true,
  publicId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  uploadedBy: { select: { publicId: true, name: true } },
  createdAt: true,
} as const;

export const safeAttachmentSelect = {
  id: true,
  publicId: true,
  file: {
    select: safeFileSelect,
  },
} as const;
