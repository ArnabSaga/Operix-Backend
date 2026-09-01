export const activitySelect = {
  publicId: true,
  action: true,
  entityType: true,
  entityPublicId: true,
  metadata: true,
  createdAt: true,
  actor: {
    select: {
      publicId: true,
      name: true,
    },
  },
} as const;
