export const taskSelect = {
  id: true,
  publicId: true,
  referenceCode: true,
  title: true,
  description: true,
  remarks: true,
  priority: true,
  status: true,
  scope: true,
  dueAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  completionMode: true,
  completionNote: true,
  scheduledStartAt: true,
  occurrenceKey: true,
  team: { select: { publicId: true, name: true } },
  category: { select: { publicId: true } },
  createdBy: {
    select: {
      publicId: true,
      name: true,
      role: true,
      employeeId: true,
      designation: true,
    },
  },
  assignments: {
    where: { unassignedAt: null },
    take: 1,
    select: {
      responsibleUser: {
        select: {
          publicId: true,
          name: true,
          role: true,
          employeeId: true,
          designation: true,
        },
      },
    },
  },
  recurrence: {
    select: {
      publicId: true,
      frequency: true,
      nextOccurrenceAt: true,
      reminderLeadMinutes: true,
      isActive: true,
    },
  },
  reminder: {
    select: { status: true, scheduledAt: true, sentAt: true },
  },
  distribution: {
    select: { status: true, scheduledAt: true, sentAt: true },
  },
  createdAt: true,
  updatedAt: true,
} as const;
