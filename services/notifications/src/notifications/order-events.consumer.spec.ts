import { OrderEventsConsumer } from './order-events.consumer';

describe('OrderEventsConsumer', () => {
  let kafkaConsumer: { subscribe: jest.Mock };
  let notificationService: {
    sendOrderConfirmedEmail: jest.Mock;
    sendOrderCancelledEmail: jest.Mock;
  };
  let consumer: OrderEventsConsumer;
  let handleMessage: (topic: string, key: string | null, value: string) => Promise<void>;

  beforeEach(async () => {
    kafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    notificationService = {
      sendOrderConfirmedEmail: jest.fn(),
      sendOrderCancelledEmail: jest.fn(),
    };
    consumer = new OrderEventsConsumer(kafkaConsumer as never, notificationService as never);

    await consumer.onModuleInit();
    expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
      ['order.confirmed', 'order.cancelled'],
      expect.any(Function),
    );
    const subscribeCalls = kafkaConsumer.subscribe.mock.calls as [string[], typeof handleMessage][];
    handleMessage = subscribeCalls[0][1];
  });

  it('subscribes to both order topics on init', () => {
    expect(kafkaConsumer.subscribe).toHaveBeenCalledTimes(1);
  });

  it('dispatches an OrderConfirmed event to sendOrderConfirmedEmail', async () => {
    const event = { id: 'event-1', payload: { orderId: 'order-1', customerId: 'customer-1' } };

    await handleMessage('order.confirmed', 'order-1', JSON.stringify(event));

    expect(notificationService.sendOrderConfirmedEmail).toHaveBeenCalledWith(
      'event-1',
      'order-1',
      'customer-1',
    );
    expect(notificationService.sendOrderCancelledEmail).not.toHaveBeenCalled();
  });

  it('dispatches an OrderCancelled event to sendOrderCancelledEmail, forwarding the reason', async () => {
    const event = {
      id: 'event-1',
      payload: { orderId: 'order-1', customerId: 'customer-1', reason: 'card declined' },
    };

    await handleMessage('order.cancelled', 'order-1', JSON.stringify(event));

    expect(notificationService.sendOrderCancelledEmail).toHaveBeenCalledWith(
      'event-1',
      'order-1',
      'customer-1',
      'card declined',
    );
  });

  it('defaults the reason to "unknown" when OrderCancelled has none', async () => {
    const event = { id: 'event-1', payload: { orderId: 'order-1', customerId: 'customer-1' } };

    await handleMessage('order.cancelled', 'order-1', JSON.stringify(event));

    expect(notificationService.sendOrderCancelledEmail).toHaveBeenCalledWith(
      'event-1',
      'order-1',
      'customer-1',
      'unknown',
    );
  });

  it('drops a message that is not valid JSON, without throwing', async () => {
    await expect(handleMessage('order.confirmed', null, 'not json')).resolves.toBeUndefined();
    expect(notificationService.sendOrderConfirmedEmail).not.toHaveBeenCalled();
  });

  it('drops a message missing customerId, without throwing', async () => {
    const event = { id: 'event-1', payload: { orderId: 'order-1' } };

    await expect(
      handleMessage('order.confirmed', null, JSON.stringify(event)),
    ).resolves.toBeUndefined();
    expect(notificationService.sendOrderConfirmedEmail).not.toHaveBeenCalled();
  });
});
