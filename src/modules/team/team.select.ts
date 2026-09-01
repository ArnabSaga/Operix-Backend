export const teamSelect = {
  id: true,
  publicId: true,
  name: true,
  adminId: true,
  admin: { select: { publicId: true } },
  createdAt: true,
  updatedAt: true,
} as const;
