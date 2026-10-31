import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { StripeService } from '../stripe/stripe.service';

// Stripe calls this directly (its own port, e.g. via `stripe listen --forward-to
// localhost:3004/webhooks/stripe` locally), not through `gateway` — gateway's proxies exist for
// the web/admin frontends' JWT-bearing traffic, and a webhook isn't that. Authenticity here comes
// from the Stripe-Signature header (verified below), not a JWT — there is no customer-facing
// concept of "who" is calling this route. See docs/decisions/0034.
@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('missing request body');
    }
    if (!signature) {
      throw new BadRequestException('missing Stripe-Signature header');
    }

    let event;
    try {
      event = this.stripeService.constructWebhookEvent(request.rawBody, signature);
    } catch (error) {
      throw new BadRequestException(
        `invalid Stripe signature: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    await this.paymentService.handleStripeEvent(event);
    return { received: true };
  }
}
