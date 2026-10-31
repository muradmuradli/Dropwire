import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

const DEFAULT_DUMMY_UNIT_PRICE_CENTS = 500;

export interface CheckoutLineItem {
  productId: string;
  quantity: number;
}

export interface CreatedCheckoutSession {
  sessionId: string;
  url: string;
}

// A deliberately dummy price: this project has no price snapshot anywhere in the saga (orders'
// OrderItem/inventory's InventoryReserved event only ever carry productId+quantity — see
// docs/decisions/0034), so there's no real amount to charge. Each line item is priced at a flat
// per-unit test amount instead of a real one, same spirit as catalog pricing being out of scope
// for PaymentConfirmed's payload (see contracts/events/payment-confirmed.schema.json).
@Injectable()
export class StripeService {
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  // Lazy construction, same reasoning as catalog's S3Service: booting with a blank
  // STRIPE_SECRET_KEY must not crash the service — only a real checkout attempt needs the key
  // to actually exist.
  private getClient(): Stripe {
    if (!this.client) {
      this.client = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') ?? '');
    }
    return this.client;
  }

  async createCheckoutSession(
    orderId: string,
    items: CheckoutLineItem[],
  ): Promise<CreatedCheckoutSession> {
    const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3100';
    const configuredUnitAmount = Number(this.config.get<string>('STRIPE_DUMMY_UNIT_PRICE_CENTS'));
    const unitAmount = Number.isFinite(configuredUnitAmount)
      ? configuredUnitAmount
      : DEFAULT_DUMMY_UNIT_PRICE_CENTS;

    const session = await this.getClient().checkout.sessions.create({
      mode: 'payment',
      // Stripe's own canonical place for "which of our records does this session belong to" —
      // read back out of the webhook event in PaymentService.handleStripeEvent.
      client_reference_id: orderId,
      success_url: `${webOrigin}/orders/${orderId}?checkout=success`,
      cancel_url: `${webOrigin}/orders/${orderId}?checkout=cancelled`,
      line_items: items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: { name: `Product ${item.productId}` },
        },
      })),
    });

    if (!session.url) {
      throw new Error(`Stripe did not return a Checkout Session URL for order ${orderId}`);
    }
    return { sessionId: session.id, url: session.url };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    return this.getClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
