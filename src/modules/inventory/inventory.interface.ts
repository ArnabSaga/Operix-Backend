import type { InventoryTransactionType } from '../../../generated/prisma/enums.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
import type { InventoryReturnStatus } from './inventory.constant.js';

export interface SafeInventoryCategoryResponse {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeInventoryItemResponse {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  team: {
    id: string;
    name: string;
  };
  category: {
    id: string;
    name: string;
  } | null;
  quantity: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isReturnable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeInventoryAssignmentResponse {
  id: string;
  item: {
    id: string;
    sku: string;
    name: string;
    isReturnable: boolean;
  };
  member: {
    id: string;
    name: string;
    employeeId: string | null;
    designation: string | null;
  };
  quantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  returnStatus: InventoryReturnStatus;
  assignedAt: Date;
  returnedAt: Date | null;
  assignedBy: {
    id: string;
    name: string;
  };
}

export interface SafeInventoryTransactionResponse {
  id: string;
  item: {
    id: string;
    sku: string;
    name: string;
  };
  type: InventoryTransactionType;
  quantity: number;
  previousQuantity: number;
  resultingQuantity: number;
  member: {
    id: string;
    name: string;
    employeeId: string | null;
  } | null;
  actor: {
    id: string;
    name: string;
  };
  assignmentId: string | null;
  reason: string | null;
  note: string | null;
  createdAt: Date;
}

export interface InventorySummaryResponse {
  activeItemCount: number;
  inactiveItemCount: number;
  lowStockItemCount: number;
  outOfStockItemCount: number;
  outstandingAssignmentCount: number;
}

export interface PaginatedInventoryCategoryResponse {
  data: SafeInventoryCategoryResponse[];
  meta: PaginationMeta;
}

export interface PaginatedInventoryItemResponse {
  data: SafeInventoryItemResponse[];
  meta: PaginationMeta;
}

export interface PaginatedInventoryAssignmentResponse {
  data: SafeInventoryAssignmentResponse[];
  meta: PaginationMeta;
}

export interface PaginatedInventoryTransactionResponse {
  data: SafeInventoryTransactionResponse[];
  meta: PaginationMeta;
}
