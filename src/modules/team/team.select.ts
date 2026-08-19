export const teamSelect = {
  id: true,
  name: true,
  adminId: true,
  createdAt: true,
  updatedAt: true,
  admin: {
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
      designation: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;
