export const notificationSelect = {
  publicId: true,
  type: true,
  title: true,
  body: true,
  targetType: true,
  targetPublicId: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: {
      publicId: true,
      name: true,
    },
  },
} as const;
