export const performanceMemberSelect = {
  id: true,
  name: true,
  employeeId: true,
  designation: true,
  status: true,
  teamMembership: {
    select: {
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
} as const;

export const performanceTaskSelect = {
  id: true,
  status: true,
  priority: true,
  dueAt: true,
  startedAt: true,
  completedAt: true,
} as const;

export const performanceTeamSelect = {
  id: true,
  name: true,
  adminId: true,
} as const;
