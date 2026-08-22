import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto.js';
import { StockInDto } from './dto/stock-in.dto.js';
import { StockOutDto } from './dto/stock-out.dto.js';
import { InventoryStockService } from './inventory-stock.service.js';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class InventoryStockController {
  constructor(private readonly stockService: InventoryStockService) {}

  @Post('items/:itemId/stock-in')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  stockIn(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId') itemId: string,
    @Body() dto: StockInDto,
  ) {
    return this.stockService.stockIn(viewer, itemId, dto);
  }

  @Post('items/:itemId/stock-out')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  stockOut(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId') itemId: string,
    @Body() dto: StockOutDto,
  ) {
    return this.stockService.stockOut(viewer, itemId, dto);
  }

  @Post('items/:itemId/adjustments')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  adjust(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId') itemId: string,
    @Body() dto: InventoryAdjustmentDto,
  ) {
    return this.stockService.adjust(viewer, itemId, dto);
  }

  @Get('transactions')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listTransactions(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: InventoryTransactionQueryDto,
  ) {
    return this.stockService.listTransactions(viewer, query);
  }
}
