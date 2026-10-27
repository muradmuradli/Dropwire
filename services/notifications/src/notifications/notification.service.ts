import { Injectable, Logger } from '@nestjs/common';
import { Counter } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';

// notifications deliberately owns no database (see services/notifications/CLAUDE.md) — so
// "dedupe by event id" (the root CLAUDE.md's rule) can't be a durable, crash-proof lookup
// the way inventory/payments/orders do it. Instead: a bounded in-memory cache of recently
// seen event ids, which catches the common case (a quick Kafka redelivery during a consumer
// group rebalance) without needing a store, and a process restart just resets it. This is an
// accepted gap, not an oversight — see docs/decisions/0016. It's acceptable specifically
// because the one real side effect here (logging/"sending" a mock email) is itself harmless
// to repeat; an actual email provider would need the real thing.
const RECENT_EVENT_CACHE_SIZE = 1000;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly recentlyHandledEventIds = new Map<string, true>();
  private readonly sentCounter: Counter<'type'>;

  constructor(metrics: MetricsService) {
    this.sentCounter = new Counter({
      name: 'notifications_sent_total',
      help: 'Mock "emails" sent, by notification type',
      labelNames: ['type'],
      registers: [metrics.registry],
    });
  }

  sendOrderConfirmedEmail(eventId: string, orderId: string, customerId: string): void {
    if (this.alreadyHandled(eventId)) {
      this.logger.log(
        `already sent the order-confirmed email for event ${eventId} (order ${orderId}); skipping duplicate`,
      );
      return;
    }
    this.logger.log(`[mock email] to customer ${customerId}: your order ${orderId} is confirmed!`);
    this.sentCounter.inc({ type: 'confirmed' });
  }

  sendOrderCancelledEmail(
    eventId: string,
    orderId: string,
    customerId: string,
    reason: string,
  ): void {
    if (this.alreadyHandled(eventId)) {
      this.logger.log(
        `already sent the order-cancelled email for event ${eventId} (order ${orderId}); skipping duplicate`,
      );
      return;
    }
    this.logger.log(
      `[mock email] to customer ${customerId}: your order ${orderId} was cancelled (${reason}).`,
    );
    this.sentCounter.inc({ type: 'cancelled' });
  }

  private alreadyHandled(eventId: string): boolean {
    if (this.recentlyHandledEventIds.has(eventId)) {
      return true;
    }
    this.recentlyHandledEventIds.set(eventId, true);
    if (this.recentlyHandledEventIds.size > RECENT_EVENT_CACHE_SIZE) {
      const oldestEventId = this.recentlyHandledEventIds.keys().next().value;
      if (oldestEventId !== undefined) {
        this.recentlyHandledEventIds.delete(oldestEventId);
      }
    }
    return false;
  }
}
