export const inventoryCategorySelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const inventoryItemSelect = {
  id: true,
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
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export const inventoryAssignmentSelect = {
  id: true,
  quantity: true,
  returnedQuantity: true,
  assignedAt: true,
  returnedAt: true,
  item: {
    select: {
      id: true,
      sku: true,
      name: true,
      isReturnable: true,
    },
  },
  member: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      designation: true,
    },
  },
  assignedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export const inventoryTransactionSelect = {
  id: true,
  type: true,
  quantity: true,
  previousQuantity: true,
  resultingQuantity: true,
  assignmentId: true,
  reason: true,
  note: true,
  createdAt: true,
  item: {
    select: {
      id: true,
      sku: true,
      name: true,
    },
  },
  member: {
    select: {
      id: true,
      name: true,
      employeeId: true,
    },
  },
  actor: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;
