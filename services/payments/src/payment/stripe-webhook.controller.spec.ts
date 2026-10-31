import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookController } from './stripe-webhook.controller';

function fakeRequest(rawBody?: Buffer) {
  return { rawBody } as unknown as Request & { rawBody?: Buffer };
}

describe('StripeWebhookController', () => {
  let stripeService: { constructWebhookEvent: jest.Mock };
  let paymentService: { handleStripeEvent: jest.Mock };
  let controller: StripeWebhookController;

  beforeEach(() => {
    stripeService = { constructWebhookEvent: jest.fn() };
    paymentService = { handleStripeEvent: jest.fn().mockResolvedValue(undefined) };
    controller = new StripeWebhookController(stripeService as never, paymentService as never);
  });

  it('rejects a request with no raw body', async () => {
    await expect(
      controller.handleStripeWebhook(fakeRequest(undefined) as never, 'sig'),
    ).rejects.toThrow(BadRequestException);
    expect(paymentService.handleStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects a request with no Stripe-Signature header', async () => {
    await expect(
      controller.handleStripeWebhook(fakeRequest(Buffer.from('{}')) as never, ''),
    ).rejects.toThrow('missing Stripe-Signature header');
  });

  it('rejects a request with an invalid signature', async () => {
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    await expect(
      controller.handleStripeWebhook(fakeRequest(Buffer.from('{}')) as never, 'bad-sig'),
    ).rejects.toThrow('invalid Stripe signature: signature mismatch');
    expect(paymentService.handleStripeEvent).not.toHaveBeenCalled();
  });

  it('hands a verified event to PaymentService and acknowledges it', async () => {
    const event = { type: 'checkout.session.completed' };
    stripeService.constructWebhookEvent.mockReturnValue(event);

    const result = await controller.handleStripeWebhook(
      fakeRequest(Buffer.from('{}')) as never,
      'good-sig',
    );

    expect(paymentService.handleStripeEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });
});
