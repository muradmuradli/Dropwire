import { OrderEventsConsumer } from './order-events.consumer';

describe('OrderEventsConsumer', () => {
  let kafkaConsumer: { subscribe: jest.Mock };
  let ordersService: {
    handlePaymentConfirmed: jest.Mock;
    handlePaymentFailed: jest.Mock;
    handleCheckoutCreated: jest.Mock;
  };
  let consumer: OrderEventsConsumer;
  let handleMessage: (topic: string, key: string | null, value: string) => Promise<void>;

  beforeEach(async () => {
    kafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    ordersService = {
      handlePaymentConfirmed: jest.fn().mockResolvedValue(undefined),
      handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
      handleCheckoutCreated: jest.fn().mockResolvedValue(undefined),
    };
    consumer = new OrderEventsConsumer(kafkaConsumer as never, ordersService as never);

    await consumer.onModuleInit();
    expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
      ['payment.confirmed', 'payment.failed', 'payment.checkout_created'],
      expect.any(Function),
    );
    const subscribeCalls = kafkaConsumer.subscribe.mock.calls as [string[], typeof handleMessage][];
    handleMessage = subscribeCalls[0][1];
  });

  it('subscribes to all three payment topics on init', () => {
    expect(kafkaConsumer.subscribe).toHaveBeenCalledTimes(1);
  });

  it('dispatches a PaymentCheckoutCreated event to handleCheckoutCreated', async () => {
    const event = {
      id: 'event-1',
      type: 'PaymentCheckoutCreated',
      correlationId: 'c1',
      payload: { orderId: 'order-1', checkoutUrl: 'https://checkout.stripe.com/cs_test_1' },
    };

    await handleMessage('payment.checkout_created', 'order-1', JSON.stringify(event));

    expect(ordersService.handleCheckoutCreated).toHaveBeenCalledWith(
      'order-1',
      'https://checkout.stripe.com/cs_test_1',
    );
  });

  it('drops a PaymentCheckoutCreated event with no checkoutUrl', async () => {
    const event = { id: 'event-1', correlationId: 'c1', payload: { orderId: 'order-1' } };

    await expect(
      handleMessage('payment.checkout_created', null, JSON.stringify(event)),
    ).resolves.toBeUndefined();
    expect(ordersService.handleCheckoutCreated).not.toHaveBeenCalled();
  });

  it('dispatches a PaymentConfirmed event to handlePaymentConfirmed', async () => {
    const event = {
      id: 'event-1',
      type: 'PaymentConfirmed',
      correlationId: 'c1',
      payload: { orderId: 'order-1', paymentId: 'pay-1' },
    };

    await handleMessage('payment.confirmed', 'order-1', JSON.stringify(event));

    expect(ordersService.handlePaymentConfirmed).toHaveBeenCalledWith('c1', 'order-1');
    expect(ordersService.handlePaymentFailed).not.toHaveBeenCalled();
  });

  it('dispatches a PaymentFailed event to handlePaymentFailed, forwarding the reason', async () => {
    const event = {
      id: 'event-1',
      type: 'PaymentFailed',
      correlationId: 'c1',
      payload: { orderId: 'order-1', reason: 'card declined' },
    };

    await handleMessage('payment.failed', 'order-1', JSON.stringify(event));

    expect(ordersService.handlePaymentFailed).toHaveBeenCalledWith(
      'c1',
      'order-1',
      'card declined',
    );
  });

  it('defaults the reason to "unknown" when PaymentFailed has none', async () => {
    const event = { id: 'event-1', correlationId: 'c1', payload: { orderId: 'order-1' } };

    await handleMessage('payment.failed', 'order-1', JSON.stringify(event));

    expect(ordersService.handlePaymentFailed).toHaveBeenCalledWith('c1', 'order-1', 'unknown');
  });

  it('drops a message that is not valid JSON, without throwing', async () => {
    await expect(handleMessage('payment.confirmed', null, 'not json')).resolves.toBeUndefined();
    expect(ordersService.handlePaymentConfirmed).not.toHaveBeenCalled();
  });

  it('drops a message missing orderId, without throwing', async () => {
    const event = { id: 'event-1', correlationId: 'c1', payload: {} };

    await expect(
      handleMessage('payment.confirmed', null, JSON.stringify(event)),
    ).resolves.toBeUndefined();
    expect(ordersService.handlePaymentConfirmed).not.toHaveBeenCalled();
  });

  it('lets a real processing failure propagate so the message is not acknowledged', async () => {
    ordersService.handlePaymentConfirmed.mockRejectedValue(new Error('db unreachable'));
    const event = { id: 'event-1', correlationId: 'c1', payload: { orderId: 'order-1' } };

    await expect(handleMessage('payment.confirmed', null, JSON.stringify(event))).rejects.toThrow(
      'db unreachable',
    );
  });
});
