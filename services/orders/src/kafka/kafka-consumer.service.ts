import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';

export type KafkaMessageHandler = (
  topic: string,
  key: string | null,
  value: string,
) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly consumer: Consumer;

  constructor(config: ConfigService) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? 'localhost:19092').split(',');
    const kafka = new Kafka({ clientId: 'orders', brokers });
    this.consumer = kafka.consumer({ groupId: 'orders' });
  }

  // One call per process, by whichever module owns a set of topics — kafkajs only accepts
  // one subscription set per consumer group member before `run()` starts the fetch loop.
  // Errors thrown by `onMessage` are deliberately NOT caught here: a message that's valid
  // JSON but fails to process (e.g. the database is briefly down) should make kafkajs retry
  // it rather than silently acknowledging a message that was never actually handled — safe
  // because every handler here must be idempotent. A message that can never succeed (e.g.
  // malformed JSON) is the caller's job to catch and skip, not this wrapper's.
  async subscribe(topics: string[], onMessage: KafkaMessageHandler): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topics, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        await onMessage(topic, message.key?.toString() ?? null, message.value?.toString() ?? '');
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
