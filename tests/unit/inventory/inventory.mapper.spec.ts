import { InventoryReturnStatus } from '../../../src/modules/inventory/inventory.constant';
import {
  getInventoryReturnStatus,
  mapInventoryItemResponse,
} from '../../../src/modules/inventory/inventory.mapper';

describe('inventory mapper', () => {
  it('derives out of stock without also marking low stock', () => {
    const response = mapInventoryItemResponse({
      id: 'item-a',
      publicId: '11111111-1111-4111-8111-111111111111',
      sku: 'PEN',
      name: 'Blue pen',
      description: null,
      quantity: 0,
      lowStockThreshold: 5,
      isReturnable: false,
      isActive: true,
      createdAt: new Date('2026-08-22T00:00:00.000Z'),
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
      team: {
        id: 'team-a',
        publicId: '22222222-2222-4222-8222-222222222222',
        name: 'Team A',
      },
      category: null,
    });

    expect(response.isOutOfStock).toBe(true);
    expect(response.isLowStock).toBe(false);
  });

  it('derives low stock only for positive stock within threshold', () => {
    const response = mapInventoryItemResponse({
      id: 'item-a',
      publicId: '11111111-1111-4111-8111-111111111111',
      sku: 'PEN',
      name: 'Blue pen',
      description: null,
      quantity: 2,
      lowStockThreshold: 5,
      isReturnable: false,
      isActive: true,
      createdAt: new Date('2026-08-22T00:00:00.000Z'),
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
      team: {
        id: 'team-a',
        publicId: '22222222-2222-4222-8222-222222222222',
        name: 'Team A',
      },
      category: {
        id: 'category-a',
        publicId: '33333333-3333-4333-8333-333333333333',
        name: 'Stationery',
      },
    });

    expect(response.isOutOfStock).toBe(false);
    expect(response.isLowStock).toBe(true);
  });

  it('derives return status from returned quantity', () => {
    expect(
      getInventoryReturnStatus({
        quantity: 5,
        returnedQuantity: 0,
      }),
    ).toBe(InventoryReturnStatus.OUTSTANDING);

    expect(
      getInventoryReturnStatus({
        quantity: 5,
        returnedQuantity: 2,
      }),
    ).toBe(InventoryReturnStatus.PARTIALLY_RETURNED);

    expect(
      getInventoryReturnStatus({
        quantity: 5,
        returnedQuantity: 5,
      }),
    ).toBe(InventoryReturnStatus.RETURNED);
  });
});
