import { status as GrpcStatus } from '@grpc/grpc-js';
import { Registry } from 'prom-client';
import { ReservationStatus as ProtoReservationStatus } from '../generated/proto/dropwire/inventory/v1/inventory';
import { Prisma } from '../../generated/prisma';
import { MetricsService } from '../metrics/metrics.service';
import { ReservationService } from './reservation.service';

function fakeMetrics() {
  return { registry: new Registry() } as unknown as MetricsService;
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('ReservationService', () => {
  let prisma: {
    stock: { findMany: jest.Mock };
    reservation: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    reservationItem: { groupBy: jest.Mock; createMany: jest.Mock };
    outboxMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let redis: { reserveStock: jest.Mock; releaseStock: jest.Mock; pipeline: jest.Mock };
  let service: ReservationService;

  beforeEach(() => {
    prisma = {
      stock: { findMany: jest.fn() },
      reservation: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      reservationItem: { groupBy: jest.fn(), createMany: jest.fn() },
      outboxMessage: { create: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    redis = {
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
      pipeline: jest.fn(),
    };
    service = new ReservationService(prisma as never, redis as never, fakeMetrics());
  });

  describe('reserveStock', () => {
    const request = {
      orderId: 'order-1',
      correlationId: 'c1',
      items: [{ productId: 'p1', quantity: 2 }],
    };

    it('reserves a fresh order when enough stock is available', async () => {
      prisma.reservation.create.mockResolvedValue(undefined);
      redis.reserveStock.mockResolvedValue(
        JSON.stringify({
          status: 'RESERVED',
          items: [{ productId: 'p1', quantity: 2, status: 'RESERVED', availableQuantity: 5 }],
        }),
      );
      prisma.reservation.update.mockResolvedValue(undefined);
      prisma.reservationItem.createMany.mockResolvedValue(undefined);

      const result = await service.reserveStock(request);

      expect(result.status).toBe(ProtoReservationStatus.RESERVATION_STATUS_RESERVED);
      expect(result.items[0]).toEqual({
        productId: 'p1',
        status: ProtoReservationStatus.RESERVATION_STATUS_RESERVED,
        availableQuantity: 5,
      });
      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: { orderId: 'order-1', correlationId: 'c1', status: 'PENDING' },
      });
      expect(redis.reserveStock).toHaveBeenCalledWith('order-1', JSON.stringify(request.items));
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.outboxMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'InventoryReserved',
          correlationId: 'c1',
          payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 2 }] },
        }) as unknown,
      });
    });

    it('reports OUT_OF_STOCK without throwing, and writes no outbox event', async () => {
      prisma.reservation.create.mockResolvedValue(undefined);
      redis.reserveStock.mockResolvedValue(
        JSON.stringify({
          status: 'OUT_OF_STOCK',
          items: [{ productId: 'p1', quantity: 2, status: 'OUT_OF_STOCK', availableQuantity: 1 }],
        }),
      );

      const result = await service.reserveStock(request);

      expect(result.status).toBe(ProtoReservationStatus.RESERVATION_STATUS_OUT_OF_STOCK);
      expect(result.items[0].availableQuantity).toBe(1);
      // No event for a failed reservation — orders already gets the answer synchronously
      // via the gRPC response, per docs/decisions/0007.
      expect(prisma.outboxMessage.create).not.toHaveBeenCalled();
    });

    it('replays a terminal result and never touches Redis on a repeated orderId', async () => {
      prisma.reservation.create.mockRejectedValue(p2002());
      prisma.reservation.findUniqueOrThrow.mockResolvedValue({
        status: 'RESERVED',
        items: [{ productId: 'p1', status: 'RESERVED', availableQuantityAtCheck: 5 }],
      });

      const result = await service.reserveStock(request);

      expect(result.status).toBe(ProtoReservationStatus.RESERVATION_STATUS_RESERVED);
      expect(redis.reserveStock).not.toHaveBeenCalled();
    });

    it('retries the Redis step for an orderId stuck PENDING (simulated crash recovery)', async () => {
      prisma.reservation.create.mockRejectedValue(p2002());
      prisma.reservation.findUniqueOrThrow.mockResolvedValue({ status: 'PENDING', items: [] });
      redis.reserveStock.mockResolvedValue(
        JSON.stringify({
          status: 'RESERVED',
          items: [{ productId: 'p1', quantity: 2, status: 'RESERVED', availableQuantity: 5 }],
        }),
      );

      const result = await service.reserveStock(request);

      expect(redis.reserveStock).toHaveBeenCalled();
      expect(result.status).toBe(ProtoReservationStatus.RESERVATION_STATUS_RESERVED);
    });

    it('rejects a retry of an already-RELEASED order instead of reserving again', async () => {
      prisma.reservation.create.mockRejectedValue(p2002());
      prisma.reservation.findUniqueOrThrow.mockResolvedValue({ status: 'RELEASED', items: [] });

      await expect(service.reserveStock(request as never)).rejects.toMatchObject({
        error: { code: GrpcStatus.FAILED_PRECONDITION },
      });
      expect(redis.reserveStock).not.toHaveBeenCalled();
    });

    it('rethrows a database error unrelated to the idempotency key', async () => {
      prisma.reservation.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.reserveStock(request as never)).rejects.toThrow('connection lost');
    });
  });

  describe('releaseStock', () => {
    const request = { orderId: 'order-1', correlationId: 'c1' };

    it('releases a reserved order, gives stock back, and writes an InventoryReleased event', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        status: 'RESERVED',
        items: [{ productId: 'p1', quantity: 2 }],
      });
      redis.releaseStock.mockResolvedValue(JSON.stringify({ released: true }));
      prisma.reservation.update.mockResolvedValue(undefined);

      const result = await service.releaseStock(request);

      expect(result).toEqual({ released: true });
      expect(redis.releaseStock).toHaveBeenCalledWith('order-1');
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: 'RELEASED' },
      });
      expect(prisma.outboxMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'InventoryReleased',
          correlationId: 'c1',
          payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 2 }] },
        }) as unknown,
      });
    });

    it('is a no-op for an order that was never reserved', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      const result = await service.releaseStock(request);

      expect(result).toEqual({ released: true });
      expect(redis.releaseStock).not.toHaveBeenCalled();
    });

    it('is idempotent for an order already released', async () => {
      prisma.reservation.findUnique.mockResolvedValue({ status: 'RELEASED' });

      const result = await service.releaseStock(request);

      expect(result).toEqual({ released: true });
      expect(redis.releaseStock).not.toHaveBeenCalled();
    });

    it('rejects releasing an order that is still PENDING', async () => {
      prisma.reservation.findUnique.mockResolvedValue({ status: 'PENDING' });

      await expect(service.releaseStock(request as never)).rejects.toMatchObject({
        error: { code: GrpcStatus.FAILED_PRECONDITION },
      });
      expect(redis.releaseStock).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit (Redis seeding)', () => {
    it('does nothing when there is no stock yet', async () => {
      prisma.stock.findMany.mockResolvedValue([]);

      await service.onModuleInit();

      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('seeds available = total - active reservations for each product', async () => {
      prisma.stock.findMany.mockResolvedValue([
        { productId: 'p1', totalQuantity: 5 },
        { productId: 'p2', totalQuantity: 2 },
      ]);
      prisma.reservationItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 3 } },
      ]);
      const set = jest.fn();
      const exec = jest.fn().mockResolvedValue([]);
      redis.pipeline.mockReturnValue({ set, exec });

      await service.onModuleInit();

      expect(set).toHaveBeenCalledWith('stock:p1', 2);
      expect(set).toHaveBeenCalledWith('stock:p2', 2);
      expect(exec).toHaveBeenCalled();
    });
  });
});
