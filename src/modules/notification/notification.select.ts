export const notificationSelect = {
  id: true,
  actorId: true,
  type: true,
  title: true,
  body: true,
  targetType: true,
  targetId: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;
