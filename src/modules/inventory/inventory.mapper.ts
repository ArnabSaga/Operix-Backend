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
  return category;
}

export function mapInventoryItemResponse(
  item: InventoryItemPayload,
): SafeInventoryItemResponse {
  return {
    ...item,
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
    ...assignment,
    remainingQuantity,
    returnStatus: getInventoryReturnStatus(assignment),
  };
}

export function mapInventoryTransactionResponse(
  transaction: InventoryTransactionPayload,
): SafeInventoryTransactionResponse {
  return transaction;
}
