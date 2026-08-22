import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateInventoryItemDto } from '../../../src/modules/inventory/dto/create-inventory-item.dto';
import { StockInDto } from '../../../src/modules/inventory/dto/stock-in.dto';
import { StockOutDto } from '../../../src/modules/inventory/dto/stock-out.dto';

describe('inventory dto validation', () => {
  it('trims item identity fields and accepts zero opening quantity', () => {
    const dto = plainToInstance(CreateInventoryItemDto, {
      teamId: ' team-a ',
      sku: ' PEN-BLUE ',
      name: ' Blue pen ',
      openingQuantity: 0,
      lowStockThreshold: 20,
      isReturnable: 'false',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.teamId).toBe('team-a');
    expect(dto.sku).toBe('PEN-BLUE');
    expect(dto.name).toBe('Blue pen');
    expect(dto.isReturnable).toBe(false);
  });

  it('rejects zero stock in quantity', () => {
    const dto = plainToInstance(StockInDto, {
      quantity: 0,
    });

    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('requires stock out reason', () => {
    const dto = plainToInstance(StockOutDto, {
      quantity: 1,
    });

    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
