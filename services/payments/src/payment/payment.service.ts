import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Counter } from 'prom-client';
import { Prisma } from '../../generated/prisma';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutLineItem, StripeService } from '../stripe/stripe.service';

const STRIPE_SESSION_EXPIRED_REASON = 'Stripe Checkout Session expired or was abandoned';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly processedCounter: Counter<'status'>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    metrics: MetricsService,
  ) {
    this.processedCounter = new Counter({
      name: 'payments_processed_total',
      help: 'Payment attempts by terminal outcome',
      labelNames: ['status'],
      registers: [metrics.registry],
    });
  }

  // Triggered by a consumed InventoryReserved event (see PaymentEventsConsumer). orderId is
  // the idempotency key — one order has at most one payment attempt, same shape as
  // inventory's Reservation (docs/decisions/0011) — so a redelivered Kafka message for an
  // order that's already resolved is a safe no-op. Unlike the old dummy-dice-roll version,
  // this doesn't reach a terminal state itself — it only gets as far as creating a Stripe
  // Checkout Session; CONFIRMED/FAILED only happen later, from Stripe's webhook (see
  // handleStripeEvent). See docs/decisions/0034.
  async handleInventoryReserved(
    eventId: string,
    correlationId: string,
    orderId: string,
    items: CheckoutLineItem[],
  ): Promise<void> {
    const existing = await this.getOrCreatePendingPayment(orderId, correlationId, eventId);
    if (existing) {
      if (existing.status !== 'PENDING') {
        this.logger.log(
          `order ${orderId} already has a terminal payment (${existing.status}); ignoring redelivered event ${eventId}`,
        );
        return;
      }
      if (existing.checkoutSessionId) {
        this.logger.log(
          `order ${orderId} already has a Checkout Session; ignoring redelivered event ${eventId}`,
        );
        return;
      }
    }

    const session = await this.stripe.createCheckoutSession(orderId, items);
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { checkoutSessionId: session.sessionId, checkoutUrl: session.url },
      }),
      this.prisma.outboxMessage.create({
        data: this.buildOutboxMessageData('PaymentCheckoutCreated', correlationId, {
          orderId,
          checkoutUrl: session.url,
        }),
      }),
    ]);
  }

  // Triggered by a verified Stripe webhook event (see StripeWebhookController — signature
  // verification happens before this is ever called, so a forged/replayed event never reaches
  // here). Only the event types this saga actually needs a terminal outcome from are handled;
  // anything else (e.g. payment_intent.created) is a deliberate no-op, not a dropped error.
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session: Stripe.Checkout.Session = event.data.object;
      await this.confirmPayment(session.client_reference_id, session.id);
      return;
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session: Stripe.Checkout.Session = event.data.object;
      await this.failPayment(session.client_reference_id, STRIPE_SESSION_EXPIRED_REASON);
      return;
    }

    this.logger.log(`ignoring unhandled Stripe event type ${event.type}`);
  }

  private async confirmPayment(orderId: string | null, providerReference: string): Promise<void> {
    if (!orderId) {
      this.logger.error('Stripe checkout.session event with no client_reference_id, dropping it');
      return;
    }

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      this.logger.error(`Stripe webhook for unknown order ${orderId}, dropping it`);
      return;
    }
    if (payment.status !== 'PENDING') {
      this.logger.log(
        `order ${orderId} already has a terminal payment (${payment.status}); ignoring redelivered Stripe webhook`,
      );
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: 'CONFIRMED', providerReference },
      }),
      this.prisma.outboxMessage.create({
        data: this.buildOutboxMessageData('PaymentConfirmed', payment.correlationId, {
          orderId,
          paymentId: providerReference,
        }),
      }),
    ]);
    this.processedCounter.inc({ status: 'CONFIRMED' });
  }

  private async failPayment(orderId: string | null, reason: string): Promise<void> {
    if (!orderId) {
      this.logger.error('Stripe checkout.session event with no client_reference_id, dropping it');
      return;
    }

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      this.logger.error(`Stripe webhook for unknown order ${orderId}, dropping it`);
      return;
    }
    if (payment.status !== 'PENDING') {
      this.logger.log(
        `order ${orderId} already has a terminal payment (${payment.status}); ignoring redelivered Stripe webhook`,
      );
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: 'FAILED', failureReason: reason },
      }),
      this.prisma.outboxMessage.create({
        data: this.buildOutboxMessageData('PaymentFailed', payment.correlationId, {
          orderId,
          reason,
        }),
      }),
    ]);
    this.processedCounter.inc({ status: 'FAILED' });
  }

  private async getOrCreatePendingPayment(orderId: string, correlationId: string, eventId: string) {
    try {
      await this.prisma.payment.create({
        data: { orderId, correlationId, triggeringEventId: eventId, status: 'PENDING' },
      });
      return null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.payment.findUniqueOrThrow({ where: { orderId } });
      }
      throw error;
    }
  }

  // Matches contracts/events/envelope.schema.json — id/occurredAt/createdAt all come from
  // Prisma defaults, so this only needs to fill in the fields that vary per event.
  private buildOutboxMessageData(type: string, correlationId: string, payload: object) {
    return {
      type,
      version: 1,
      correlationId,
      payload: payload as Prisma.InputJsonValue,
    };
  }
}
