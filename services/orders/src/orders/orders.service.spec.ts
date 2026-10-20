import { of, throwError } from 'rxjs';
import { ReservationStatus } from '../generated/proto/dropwire/inventory/v1/inventory';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let prisma: {
    order: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  };
  let inventoryService: { reserveStock: jest.Mock };
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
        findUnique: jest.fn(),
      },
    };
    inventoryService = { reserveStock: jest.fn() };
    const inventoryClient = { getService: jest.fn().mockReturnValue(inventoryService) };

    service = new OrdersService(prisma as never, inventoryClient as never);
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
});
