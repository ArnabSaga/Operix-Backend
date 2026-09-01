import type { Prisma } from '../../../generated/prisma/client.js';
import { InventoryReturnStatus } from './inventory.constant.js';
import type {
  SafeInventoryAssignmentResponse,
  SafeInventoryCategoryResponse,
  SafeInventoryItemResponse,
  SafeInventoryTransactionResponse,
} from './inventory.interface.js';
import {
  inventoryAssignmentSelect,
  inventoryCategorySelect,
  inventoryItemSelect,
  inventoryTransactionSelect,
} from './inventory.select.js';

type InventoryCategoryPayload = Prisma.InventoryCategoryGetPayload<{
  select: typeof inventoryCategorySelect;
}>;

type InventoryItemPayload = Prisma.InventoryItemGetPayload<{
  select: typeof inventoryItemSelect;
}>;

type InventoryAssignmentPayload = Prisma.InventoryAssignmentGetPayload<{
  select: typeof inventoryAssignmentSelect;
}>;

type InventoryTransactionPayload = Prisma.InventoryTransactionGetPayload<{
  select: typeof inventoryTransactionSelect;
}>;

export function mapInventoryCategoryResponse(
  category: InventoryCategoryPayload,
): SafeInventoryCategoryResponse {
  return {
    id: category.publicId,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export function mapInventoryItemResponse(
  item: InventoryItemPayload,
): SafeInventoryItemResponse {
  return {
    id: item.publicId,
    sku: item.sku,
    name: item.name,
    description: item.description,
    team: { id: item.team.publicId, name: item.team.name },
    category: item.category
      ? { id: item.category.publicId, name: item.category.name }
      : null,
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold,
    isReturnable: item.isReturnable,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    isOutOfStock: item.quantity === 0,
    isLowStock:
      item.lowStockThreshold !== null &&
      item.quantity > 0 &&
      item.quantity <= item.lowStockThreshold,
  };
}

export function getInventoryReturnStatus(input: {
  quantity: number;
  returnedQuantity: number;
}): InventoryReturnStatus {
  if (input.returnedQuantity === 0) {
    return InventoryReturnStatus.OUTSTANDING;
  }

  if (input.returnedQuantity < input.quantity) {
    return InventoryReturnStatus.PARTIALLY_RETURNED;
  }

  return InventoryReturnStatus.RETURNED;
}

export function mapInventoryAssignmentResponse(
  assignment: InventoryAssignmentPayload,
): SafeInventoryAssignmentResponse {
  const remainingQuantity = assignment.quantity - assignment.returnedQuantity;

  return {
    id: assignment.publicId,
    item: {
      id: assignment.item.publicId,
      sku: assignment.item.sku,
      name: assignment.item.name,
      isReturnable: assignment.item.isReturnable,
    },
    member: {
      id: assignment.member.publicId,
      name: assignment.member.name,
      employeeId: assignment.member.employeeId,
      designation: assignment.member.designation,
    },
    assignedBy: {
      id: assignment.assignedBy.publicId,
      name: assignment.assignedBy.name,
    },
    quantity: assignment.quantity,
    returnedQuantity: assignment.returnedQuantity,
    assignedAt: assignment.assignedAt,
    returnedAt: assignment.returnedAt,
    remainingQuantity,
    returnStatus: getInventoryReturnStatus(assignment),
  };
}

export function mapInventoryTransactionResponse(
  transaction: InventoryTransactionPayload,
): SafeInventoryTransactionResponse {
  return {
    id: transaction.publicId,
    item: {
      id: transaction.item.publicId,
      sku: transaction.item.sku,
      name: transaction.item.name,
    },
    type: transaction.type,
    quantity: transaction.quantity,
    previousQuantity: transaction.previousQuantity,
    resultingQuantity: transaction.resultingQuantity,
    member: transaction.member
      ? {
          id: transaction.member.publicId,
          name: transaction.member.name,
          employeeId: transaction.member.employeeId,
        }
      : null,
    actor: { id: transaction.actor.publicId, name: transaction.actor.name },
    assignmentId: transaction.assignment?.publicId ?? null,
    reason: transaction.reason,
    note: transaction.note,
    createdAt: transaction.createdAt,
  };
}
