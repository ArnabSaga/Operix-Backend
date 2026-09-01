export const inventoryCategorySelect = {
  id: true,
  publicId: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const inventoryItemSelect = {
  id: true,
  publicId: true,
  sku: true,
  name: true,
  description: true,
  quantity: true,
  lowStockThreshold: true,
  isReturnable: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  team: {
    select: {
      id: true,
      publicId: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      publicId: true,
      name: true,
    },
  },
} as const;

export const inventoryAssignmentSelect = {
  id: true,
  publicId: true,
  quantity: true,
  returnedQuantity: true,
  assignedAt: true,
  returnedAt: true,
  item: {
    select: {
      publicId: true,
      sku: true,
      name: true,
      isReturnable: true,
    },
  },
  member: {
    select: {
      publicId: true,
      name: true,
      employeeId: true,
      designation: true,
    },
  },
  assignedBy: {
    select: {
      publicId: true,
      name: true,
    },
  },
} as const;

export const inventoryTransactionSelect = {
  id: true,
  publicId: true,
  type: true,
  quantity: true,
  previousQuantity: true,
  resultingQuantity: true,
  assignmentId: true,
  assignment: { select: { publicId: true } },
  reason: true,
  note: true,
  createdAt: true,
  item: {
    select: {
      publicId: true,
      sku: true,
      name: true,
    },
  },
  member: {
    select: {
      publicId: true,
      name: true,
      employeeId: true,
    },
  },
  actor: {
    select: {
      publicId: true,
      name: true,
    },
  },
} as const;
