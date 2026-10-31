import { StripeService } from './stripe.service';

const createMock = jest.fn();
const constructEventMock = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: createMock } },
    webhooks: { constructEvent: constructEventMock },
  })),
);

function fakeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe('StripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('builds one line item per item at the configured dummy unit price', async () => {
      createMock.mockResolvedValue({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/cs_test_1',
      });
      const service = new StripeService(
        fakeConfig({
          STRIPE_SECRET_KEY: 'sk_test_x',
          WEB_ORIGIN: 'http://localhost:3100',
          STRIPE_DUMMY_UNIT_PRICE_CENTS: '750',
        }),
      );

      const result = await service.createCheckoutSession('order-1', [
        { productId: 'p1', quantity: 2 },
      ]);

      expect(result).toEqual({
        sessionId: 'cs_test_1',
        url: 'https://checkout.stripe.com/cs_test_1',
      });
      const calls = createMock.mock.calls as [
        {
          client_reference_id: string;
          success_url: string;
          cancel_url: string;
          line_items: unknown[];
        },
      ][];
      const call = calls[0][0];
      expect(call.client_reference_id).toBe('order-1');
      expect(call.success_url).toBe('http://localhost:3100/orders/order-1?checkout=success');
      expect(call.cancel_url).toBe('http://localhost:3100/orders/order-1?checkout=cancelled');
      expect(call.line_items).toEqual([
        {
          quantity: 2,
          price_data: { currency: 'usd', unit_amount: 750, product_data: { name: 'Product p1' } },
        },
      ]);
    });

    it('falls back to the default dummy unit price and web origin when not configured', async () => {
      createMock.mockResolvedValue({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/cs_test_1',
      });
      const service = new StripeService(fakeConfig({}));

      await service.createCheckoutSession('order-1', [{ productId: 'p1', quantity: 1 }]);

      const calls = createMock.mock.calls as [
        { success_url: string; line_items: [{ price_data: { unit_amount: number } }] },
      ][];
      const call = calls[0][0];
      expect(call.success_url).toBe('http://localhost:3100/orders/order-1?checkout=success');
      expect(call.line_items[0].price_data.unit_amount).toBe(500);
    });

    it('throws if Stripe does not return a Checkout Session URL', async () => {
      createMock.mockResolvedValue({ id: 'cs_test_1', url: null });
      const service = new StripeService(fakeConfig({}));

      await expect(
        service.createCheckoutSession('order-1', [{ productId: 'p1', quantity: 1 }]),
      ).rejects.toThrow('did not return a Checkout Session URL');
    });
  });

  describe('constructWebhookEvent', () => {
    it('verifies the signature against STRIPE_WEBHOOK_SECRET', () => {
      constructEventMock.mockReturnValue({ type: 'checkout.session.completed' });
      const service = new StripeService(fakeConfig({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }));
      const body = Buffer.from('raw body');

      const event = service.constructWebhookEvent(body, 'sig_abc');

      expect(constructEventMock).toHaveBeenCalledWith(body, 'sig_abc', 'whsec_x');
      expect(event).toEqual({ type: 'checkout.session.completed' });
    });
  });
});
