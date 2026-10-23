import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(config: ConfigService) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? 'localhost:19092').split(',');
    const kafka = new Kafka({ clientId: 'orders', brokers });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async send(topic: string, key: string, value: string): Promise<void> {
    await this.producer.send({ topic, messages: [{ key, value }] });
  }
}
