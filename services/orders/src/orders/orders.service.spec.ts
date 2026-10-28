import { of, throwError } from 'rxjs';
import { Registry } from 'prom-client';
import { ReservationStatus } from '../generated/proto/dropwire/inventory/v1/inventory';
import { MetricsService } from '../metrics/metrics.service';
import { OrdersService } from './orders.service';

function fakeMetrics() {
  return { registry: new Registry() } as unknown as MetricsService;
}

describe('OrdersService', () => {
  let prisma: {
    order: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    outboxMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let inventoryService: { reserveStock: jest.Mock; releaseStock: jest.Mock };
  let service: OrdersService;

  const validInput = {
    customerId: 'customer-1',
    correlationId: 'c1',
    items: [{ productId: 'p1', quantity: 2 }],
  };

  beforeEach(() => {
    prisma = {
      order: {
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, items: [] })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      outboxMessage: { create: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    inventoryService = {
      reserveStock: jest.fn(),
      releaseStock: jest.fn().mockReturnValue(of({ released: true })),
    };
    const inventoryClient = { getService: jest.fn().mockReturnValue(inventoryService) };

    service = new OrdersService(prisma as never, inventoryClient as never, fakeMetrics());
    service.onModuleInit();
  });

  describe('placeOrder', () => {
    it('records RESERVED when inventory reserves the stock', async () => {
      inventoryService.reserveStock.mockReturnValue(
        of({ status: ReservationStatus.RESERVATION_STATUS_RESERVED, items: [] }),
      );

      const result = await service.placeOrder(validInput);

      expect(result.order.status).toBe('RESERVED');
      expect(inventoryService.reserveStock).toHaveBeenCalledTimes(1);

      const createCalls = prisma.order.create.mock.calls as [
        {
          data: {
            customerId: string;
            correlationId: string;
            status: string;
            items: { createMany: { data: unknown } };
          };
        },
      ][];
      expect(createCalls[0][0].data).toMatchObject({
        customerId: 'customer-1',
        correlationId: 'c1',
        status: 'PLACED',
        items: { createMany: { data: validInput.items } },
      });
    });

    it('records CANCELLED when inventory reports OUT_OF_STOCK', async () => {
      inventoryService.reserveStock.mockReturnValue(
        of({ status: ReservationStatus.RESERVATION_STATUS_OUT_OF_STOCK, items: [] }),
      );

      const result = await service.placeOrder(validInput);

      expect(result.order.status).toBe('CANCELLED');
    });

    it('passes the same orderId used for the Order row to ReserveStock', async () => {
      inventoryService.reserveStock.mockReturnValue(
        of({ status: ReservationStatus.RESERVATION_STATUS_RESERVED, items: [] }),
      );

      await service.placeOrder(validInput);

      const createCalls = prisma.order.create.mock.calls as [{ data: { id: string } }][];
      const reserveStockCalls = inventoryService.reserveStock.mock.calls as [{ orderId: string }][];
      expect(reserveStockCalls[0][0].orderId).toBe(createCalls[0][0].data.id);
    });

    it('retries a transient failure and still succeeds', async () => {
      inventoryService.reserveStock
        .mockReturnValueOnce(throwError(() => new Error('unreachable')))
        .mockReturnValueOnce(
          of({ status: ReservationStatus.RESERVATION_STATUS_RESERVED, items: [] }),
        );

      const result = await service.placeOrder(validInput);

      expect(inventoryService.reserveStock).toHaveBeenCalledTimes(2);
      expect(result.order.status).toBe('RESERVED');
    }, 10000);

    it('marks RESERVATION_FAILED and returns 503 after every retry fails', async () => {
      inventoryService.reserveStock.mockReturnValue(throwError(() => new Error('unreachable')));

      await expect(service.placeOrder(validInput)).rejects.toThrow(/could not reach inventory/);

      expect(inventoryService.reserveStock).toHaveBeenCalledTimes(3);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'RESERVATION_FAILED' } }),
      );
    }, 10000);

    it('rejects a missing customerId before touching the database', async () => {
      await expect(service.placeOrder({ ...validInput, customerId: '' })).rejects.toThrow(
        'customerId is required',
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('rejects an empty items list before touching the database', async () => {
      await expect(service.placeOrder({ ...validInput, items: [] })).rejects.toThrow(
        'an order needs at least one item',
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('rejects an item with a non-positive quantity before touching the database', async () => {
      await expect(
        service.placeOrder({ ...validInput, items: [{ productId: 'p1', quantity: 0 }] }),
      ).rejects.toThrow('must be a positive whole number');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentConfirmed', () => {
    it('transitions a RESERVED order to CONFIRMED and writes an OrderConfirmed outbox event', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });

      await service.handlePaymentConfirmed('c1', 'order-1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'RESERVED' },
        data: { status: 'CONFIRMED' },
      });
      expect(prisma.outboxMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'OrderConfirmed',
          correlationId: 'c1',
          payload: { orderId: 'order-1', customerId: 'customer-1' },
        }) as unknown,
      });
    });

    it('is a no-op (no outbox write) when the order is not RESERVED — redelivered or duplicate event', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await service.handlePaymentConfirmed('c1', 'order-1');

      expect(prisma.outboxMessage.create).not.toHaveBeenCalled();
    });

    it('drops the event for an order that does not exist, without touching the transaction', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await service.handlePaymentConfirmed('c1', 'missing-order');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentFailed', () => {
    it('releases stock, transitions a RESERVED order to CANCELLED, and writes an OrderCancelled outbox event', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });

      await service.handlePaymentFailed('c1', 'order-1', 'card declined');

      expect(inventoryService.releaseStock).toHaveBeenCalledWith({
        orderId: 'order-1',
        correlationId: 'c1',
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'RESERVED' },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.outboxMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'OrderCancelled',
          correlationId: 'c1',
          payload: { orderId: 'order-1', customerId: 'customer-1', reason: 'card declined' },
        }) as unknown,
      });
    });

    it('is a no-op (no outbox write) when the order is not RESERVED — redelivered or duplicate event', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await service.handlePaymentFailed('c1', 'order-1', 'card declined');

      expect(prisma.outboxMessage.create).not.toHaveBeenCalled();
    });

    it('still calls ReleaseStock even when the order turns out not to be RESERVED (idempotent either way)', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await service.handlePaymentFailed('c1', 'order-1', 'card declined');

      expect(inventoryService.releaseStock).toHaveBeenCalledTimes(1);
    });

    it('retries ReleaseStock on a transient failure', async () => {
      inventoryService.releaseStock
        .mockReturnValueOnce(throwError(() => new Error('unreachable')))
        .mockReturnValueOnce(of({ released: true }));
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });

      await service.handlePaymentFailed('c1', 'order-1', 'card declined');

      expect(inventoryService.releaseStock).toHaveBeenCalledTimes(2);
      expect(prisma.outboxMessage.create).toHaveBeenCalled();
    }, 10000);

    it('propagates the error (and never touches the database) when every ReleaseStock retry fails', async () => {
      inventoryService.releaseStock.mockReturnValue(throwError(() => new Error('unreachable')));
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1', customerId: 'customer-1' });

      await expect(service.handlePaymentFailed('c1', 'order-1', 'card declined')).rejects.toThrow(
        'unreachable',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }, 10000);

    it('drops the event for an order that does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await service.handlePaymentFailed('c1', 'missing-order', 'card declined');

      expect(inventoryService.releaseStock).not.toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    it('returns the order Prisma finds', async () => {
      const order = { id: 'order-1', status: 'RESERVED' };
      prisma.order.findUnique.mockResolvedValue(order);

      await expect(service.getOrder('order-1')).resolves.toEqual(order);
    });

    it('returns null when no order matches', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.getOrder('missing')).resolves.toBeNull();
    });
  });

  describe('getOrdersForCustomer', () => {
    it('queries by customerId, newest first, capped at 50', async () => {
      const orders = [{ id: 'order-2' }, { id: 'order-1' }];
      prisma.order.findMany.mockResolvedValue(orders);

      await expect(service.getOrdersForCustomer('customer-1')).resolves.toEqual(orders);

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { customerId: 'customer-1' },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });
});
