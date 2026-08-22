import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { InventoryAssignmentController } from './inventory-assignment.controller.js';
import { InventoryAssignmentService } from './inventory-assignment.service.js';
import { InventoryCategoryController } from './inventory-category.controller.js';
import { InventoryCategoryService } from './inventory-category.service.js';
import { InventoryItemController } from './inventory-item.controller.js';
import { InventoryItemService } from './inventory-item.service.js';
import { InventoryStockController } from './inventory-stock.controller.js';
import { InventoryStockService } from './inventory-stock.service.js';
import { InventorySummaryController } from './inventory-summary.controller.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [
    InventoryCategoryController,
    InventoryItemController,
    InventoryStockController,
    InventoryAssignmentController,
    InventorySummaryController,
  ],
  providers: [
    InventoryCategoryService,
    InventoryItemService,
    InventoryStockService,
    InventoryAssignmentService,
  ],
})
export class InventoryModule {}
