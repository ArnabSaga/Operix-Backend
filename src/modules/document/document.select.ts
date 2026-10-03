export const documentSelect = {
  publicId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: {
    select: {
      publicId: true,
      name: true,
    },
  },
  taskAttachments: {
    select: {
      task: {
        select: {
          publicId: true,
          title: true,
        },
      },
    },
  },
  submissionAttachments: {
    select: {
      submission: {
        select: {
          publicId: true,
          version: true,
          task: {
            select: {
              publicId: true,
              title: true,
            },
          },
        },
      },
    },
  },
} as const;
