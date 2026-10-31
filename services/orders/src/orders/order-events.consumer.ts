import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PaymentConfirmed } from '../generated/events/payment-confirmed';
import { PaymentFailed } from '../generated/events/payment-failed';
import { PaymentCheckoutCreated } from '../generated/events/payment-checkout-created';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { OrdersService } from './orders.service';

const PAYMENT_CONFIRMED_TOPIC = 'payment.confirmed';
const PAYMENT_FAILED_TOPIC = 'payment.failed';
const PAYMENT_CHECKOUT_CREATED_TOPIC = 'payment.checkout_created';

type ConsumedEvent = PaymentConfirmed | PaymentFailed | PaymentCheckoutCreated;

@Injectable()
export class OrderEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      [PAYMENT_CONFIRMED_TOPIC, PAYMENT_FAILED_TOPIC, PAYMENT_CHECKOUT_CREATED_TOPIC],
      (topic, _key, value) => this.handleMessage(topic, value),
    );
  }

  private async handleMessage(topic: string, value: string): Promise<void> {
    // A message that will never parse/validate is a poison pill — retrying it forever
    // would just loop. Log and drop it here; anything past this point (a real processing
    // failure, e.g. the database or inventory being briefly unreachable) is intentionally
    // left to throw so KafkaConsumerService doesn't acknowledge it, and kafkajs retries
    // instead — safe because OrdersService's handlers are idempotent.
    let event: ConsumedEvent;
    try {
      event = JSON.parse(value) as ConsumedEvent;
    } catch (error) {
      this.logger.error(
        `could not parse a message from ${topic} as JSON, dropping it: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const orderId = event.payload?.orderId;
    if (!event.id || !event.correlationId || typeof orderId !== 'string') {
      this.logger.error(`malformed ${topic} event (id=${event.id ?? 'unknown'}), dropping it`);
      return;
    }

    if (topic === PAYMENT_CONFIRMED_TOPIC) {
      await this.ordersService.handlePaymentConfirmed(event.correlationId, orderId);
      return;
    }

    if (topic === PAYMENT_FAILED_TOPIC) {
      const reason = (event as PaymentFailed).payload?.reason ?? 'unknown';
      await this.ordersService.handlePaymentFailed(event.correlationId, orderId, reason);
      return;
    }

    if (topic === PAYMENT_CHECKOUT_CREATED_TOPIC) {
      const checkoutUrl = (event as PaymentCheckoutCreated).payload?.checkoutUrl;
      if (typeof checkoutUrl !== 'string') {
        this.logger.error(`malformed ${topic} event (id=${event.id}), dropping it`);
        return;
      }
      await this.ordersService.handleCheckoutCreated(orderId, checkoutUrl);
      return;
    }

    this.logger.error(`received a message from an unexpected topic ${topic}, dropping it`);
  }
}
