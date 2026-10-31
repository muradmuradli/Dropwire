import { StockService } from './stock.service';

describe('StockService', () => {
  let prisma: {
    stock: { upsert: jest.Mock };
    reservationItem: { aggregate: jest.Mock };
  };
  let redis: { set: jest.Mock };
  let service: StockService;

  beforeEach(() => {
    prisma = {
      stock: { upsert: jest.fn() },
      reservationItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: null } }) },
    };
    redis = { set: jest.fn().mockResolvedValue('OK') };
    service = new StockService(prisma as never, redis as never);
  });

  it('rejects a blank productId', async () => {
    await expect(service.setStock('', 10)).rejects.toThrow('productId is required');
    expect(prisma.stock.upsert).not.toHaveBeenCalled();
  });

  it('rejects a negative quantity', async () => {
    await expect(service.setStock('p1', -1)).rejects.toThrow(
      'quantity must be a non-negative whole number',
    );
  });

  it('rejects a non-integer quantity', async () => {
    await expect(service.setStock('p1', 1.5)).rejects.toThrow(
      'quantity must be a non-negative whole number',
    );
  });

  it('accepts a quantity of exactly 0 (listed but not yet stocked)', async () => {
    prisma.stock.upsert.mockResolvedValue({ productId: 'p1', totalQuantity: 0 });

    await service.setStock('p1', 0);

    expect(redis.set).toHaveBeenCalledWith('stock:p1', 0);
  });

  it('upserts the Stock row and seeds the full quantity in Redis when nothing is reserved yet', async () => {
    prisma.stock.upsert.mockResolvedValue({ productId: 'p1', totalQuantity: 100 });

    const result = await service.setStock('p1', 100);

    expect(prisma.stock.upsert).toHaveBeenCalledWith({
      where: { productId: 'p1' },
      create: { productId: 'p1', totalQuantity: 100 },
      update: { totalQuantity: 100 },
    });
    expect(redis.set).toHaveBeenCalledWith('stock:p1', 100);
    expect(result).toEqual({ productId: 'p1', totalQuantity: 100 });
  });

  it('subtracts already-reserved quantity when re-setting stock for an existing product', async () => {
    prisma.stock.upsert.mockResolvedValue({ productId: 'p1', totalQuantity: 100 });
    prisma.reservationItem.aggregate.mockResolvedValue({ _sum: { quantity: 30 } });

    await service.setStock('p1', 100);

    expect(prisma.reservationItem.aggregate).toHaveBeenCalledWith({
      where: { productId: 'p1', status: 'RESERVED', reservation: { status: 'RESERVED' } },
      _sum: { quantity: true },
    });
    expect(redis.set).toHaveBeenCalledWith('stock:p1', 70);
  });
});
