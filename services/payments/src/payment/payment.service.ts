import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_FAILURE_RATE = 0.3;
const SIMULATED_DECLINE_REASON = 'simulated decline (PAYMENT_FAILURE_RATE)';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly failureRate: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const configured = Number(config.get<string>('PAYMENT_FAILURE_RATE'));
    this.failureRate = Number.isFinite(configured) ? configured : DEFAULT_FAILURE_RATE;
  }

  // Triggered by a consumed InventoryReserved event (see PaymentEventsConsumer). orderId is
  // the idempotency key — one order has at most one payment attempt, same shape as
  // inventory's Reservation (docs/decisions/0011) — so a redelivered Kafka message for an
  // order that's already resolved is a safe no-op, and one for an order still PENDING
  // (a crash mid-attempt) safely retries instead of charging twice.
  async handleInventoryReserved(
    eventId: string,
    correlationId: string,
    orderId: string,
  ): Promise<void> {
    const existing = await this.getOrCreatePendingPayment(orderId, correlationId, eventId);
    if (existing && existing.status !== 'PENDING') {
      this.logger.log(
        `order ${orderId} already has a terminal payment (${existing.status}); ignoring redelivered event ${eventId}`,
      );
      return;
    }

    if (Math.random() >= this.failureRate) {
      const providerReference = randomUUID();
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { orderId },
          data: { status: 'CONFIRMED', providerReference },
        }),
        this.prisma.outboxMessage.create({
          data: this.buildOutboxMessageData('PaymentConfirmed', correlationId, {
            orderId,
            paymentId: providerReference,
          }),
        }),
      ]);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: 'FAILED', failureReason: SIMULATED_DECLINE_REASON },
      }),
      this.prisma.outboxMessage.create({
        data: this.buildOutboxMessageData('PaymentFailed', correlationId, {
          orderId,
          reason: SIMULATED_DECLINE_REASON,
        }),
      }),
    ]);
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
