export const performanceMemberSelect = {
  id: true,
  publicId: true,
  name: true,
  employeeId: true,
  designation: true,
  status: true,
  teamMembership: {
    select: {
      teamId: true,
      team: {
        select: {
          publicId: true,
          name: true,
        },
      },
    },
  },
} as const;

export const performanceTaskSelect = {
  id: true,
  publicId: true,
  status: true,
  priority: true,
  dueAt: true,
  startedAt: true,
  completedAt: true,
} as const;

export const performanceTeamSelect = {
  id: true,
  publicId: true,
  name: true,
  adminId: true,
  admin: { select: { publicId: true } },
} as const;
