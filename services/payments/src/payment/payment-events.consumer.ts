import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InventoryReserved } from '../generated/events/inventory-reserved';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { PaymentService } from './payment.service';

const INVENTORY_RESERVED_TOPIC = 'inventory.reserved';

@Injectable()
export class PaymentEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe([INVENTORY_RESERVED_TOPIC], (topic, _key, value) =>
      this.handleMessage(topic, value),
    );
  }

  private async handleMessage(topic: string, value: string): Promise<void> {
    // A message that will never parse/validate is a poison pill — retrying it forever
    // would just loop. Log and drop it here; anything past this point (a real processing
    // failure, e.g. the database being briefly down) is intentionally left to throw so
    // KafkaConsumerService doesn't acknowledge it, and kafkajs retries instead.
    let event: InventoryReserved;
    try {
      event = JSON.parse(value) as InventoryReserved;
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

    await this.paymentService.handleInventoryReserved(event.id, event.correlationId, orderId);
  }
}
