import { PaymentEventsConsumer } from './payment-events.consumer';

describe('PaymentEventsConsumer', () => {
  let kafkaConsumer: { subscribe: jest.Mock };
  let paymentService: { handleInventoryReserved: jest.Mock };
  let consumer: PaymentEventsConsumer;
  let handleMessage: (topic: string, key: string | null, value: string) => Promise<void>;

  beforeEach(async () => {
    kafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    paymentService = { handleInventoryReserved: jest.fn().mockResolvedValue(undefined) };
    consumer = new PaymentEventsConsumer(kafkaConsumer as never, paymentService as never);

    await consumer.onModuleInit();
    expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
      ['inventory.reserved'],
      expect.any(Function),
    );
    const subscribeCalls = kafkaConsumer.subscribe.mock.calls as [string[], typeof handleMessage][];
    handleMessage = subscribeCalls[0][1];
  });

  it('subscribes to inventory.reserved on init', () => {
    expect(kafkaConsumer.subscribe).toHaveBeenCalledTimes(1);
  });

  it('hands a well-formed InventoryReserved event to PaymentService', async () => {
    const event = {
      id: 'event-1',
      type: 'InventoryReserved',
      version: 1,
      occurredAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'c1',
      payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 2 }] },
    };

    await handleMessage('inventory.reserved', 'order-1', JSON.stringify(event));

    expect(paymentService.handleInventoryReserved).toHaveBeenCalledWith(
      'event-1',
      'c1',
      'order-1',
      [{ productId: 'p1', quantity: 2 }],
    );
  });

  it('drops a message with no items, without throwing', async () => {
    const event = {
      id: 'event-1',
      correlationId: 'c1',
      payload: { orderId: 'order-1', items: [] },
    };

    await expect(
      handleMessage('inventory.reserved', null, JSON.stringify(event)),
    ).resolves.toBeUndefined();
    expect(paymentService.handleInventoryReserved).not.toHaveBeenCalled();
  });

  it('drops a message that is not valid JSON, without throwing', async () => {
    await expect(handleMessage('inventory.reserved', null, 'not json')).resolves.toBeUndefined();
    expect(paymentService.handleInventoryReserved).not.toHaveBeenCalled();
  });

  it('drops a message missing orderId, without throwing', async () => {
    const event = { id: 'event-1', correlationId: 'c1', payload: {} };

    await expect(
      handleMessage('inventory.reserved', null, JSON.stringify(event)),
    ).resolves.toBeUndefined();
    expect(paymentService.handleInventoryReserved).not.toHaveBeenCalled();
  });

  it('lets a real processing failure propagate so the message is not acknowledged', async () => {
    paymentService.handleInventoryReserved.mockRejectedValue(new Error('db unreachable'));
    const event = {
      id: 'event-1',
      correlationId: 'c1',
      payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 1 }] },
    };

    await expect(handleMessage('inventory.reserved', null, JSON.stringify(event))).rejects.toThrow(
      'db unreachable',
    );
  });
});
