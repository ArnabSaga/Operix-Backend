import type { Prisma } from '../../../generated/prisma/client.js';

export const submissionSelect = {
  id: true,
  publicId: true,
  taskId: true,
  submittedById: true,
  task: { select: { publicId: true } },
  submittedBy: { select: { publicId: true } },
  version: true,
  submissionText: true,
  submittedAt: true,
  createdAt: true,
  attachments: {
    select: {
      id: true,
      file: {
        select: {
          id: true,
          publicId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedById: true,
          uploadedBy: { select: { publicId: true } },
          createdAt: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TaskSubmissionSelect;
