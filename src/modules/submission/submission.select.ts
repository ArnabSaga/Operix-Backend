import type { Prisma } from '../../../generated/prisma/client.js';

export const submissionSelect = {
  id: true,
  taskId: true,
  submittedById: true,
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
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedById: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TaskSubmissionSelect;
