import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrderCancelled } from '../generated/events/order-cancelled';
import { OrderConfirmed } from '../generated/events/order-confirmed';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { NotificationService } from './notification.service';

const ORDER_CONFIRMED_TOPIC = 'order.confirmed';
const ORDER_CANCELLED_TOPIC = 'order.cancelled';

@Injectable()
export class OrderEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      [ORDER_CONFIRMED_TOPIC, ORDER_CANCELLED_TOPIC],
      (topic, _key, value) => this.handleMessage(topic, value),
    );
  }

  // Not async — nothing here actually awaits anything (sending the "email" is a synchronous
  // log call), but the signature stays Promise<void> to match KafkaMessageHandler.
  private handleMessage(topic: string, value: string): Promise<void> {
    // A message that will never parse/validate is a poison pill — retrying it forever
    // would just loop. Log and drop it here.
    let event: OrderConfirmed | OrderCancelled;
    try {
      event = JSON.parse(value) as OrderConfirmed | OrderCancelled;
    } catch (error) {
      this.logger.error(
        `could not parse a message from ${topic} as JSON, dropping it: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve();
    }

    const orderId = event.payload?.orderId;
    const customerId = event.payload?.customerId;
    if (!event.id || typeof orderId !== 'string' || typeof customerId !== 'string') {
      this.logger.error(`malformed ${topic} event (id=${event.id ?? 'unknown'}), dropping it`);
      return Promise.resolve();
    }

    if (topic === ORDER_CONFIRMED_TOPIC) {
      this.notificationService.sendOrderConfirmedEmail(event.id, orderId, customerId);
      return Promise.resolve();
    }

    if (topic === ORDER_CANCELLED_TOPIC) {
      const reason = (event as OrderCancelled).payload?.reason ?? 'unknown';
      this.notificationService.sendOrderCancelledEmail(event.id, orderId, customerId, reason);
      return Promise.resolve();
    }

    this.logger.error(`received a message from an unexpected topic ${topic}, dropping it`);
    return Promise.resolve();
  }
}
