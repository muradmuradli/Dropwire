import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { PrismaService } from '../prisma/prisma.service';

const RELAY_INTERVAL_MS = 2000;
const RELAY_BATCH_SIZE = 50;

// See docs/event-catalog.md for the full topic/producer/consumer table.
const TOPIC_BY_EVENT_TYPE: Record<string, string> = {
  InventoryReserved: 'inventory.reserved',
  InventoryReleased: 'inventory.released',
};

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: KafkaProducerService,
  ) {}

  @Interval(RELAY_INTERVAL_MS)
  async relay(): Promise<void> {
    const pending = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: RELAY_BATCH_SIZE,
    });

    for (const message of pending) {
      const topic = TOPIC_BY_EVENT_TYPE[message.type];
      if (!topic) {
        // A type with no mapped topic is a bug in this file, not a transient failure —
        // skip it rather than retrying it forever every tick.
        this.logger.error(
          `no topic mapped for outbox event type "${message.type}" (id=${message.id})`,
        );
        continue;
      }

      const envelope = JSON.stringify({
        id: message.id,
        type: message.type,
        version: message.version,
        occurredAt: message.occurredAt.toISOString(),
        correlationId: message.correlationId,
        payload: message.payload,
      });

      try {
        await this.producer.send(topic, this.partitionKey(message.payload) ?? message.id, envelope);
      } catch (error) {
        // Likely means Kafka itself is unreachable right now — every message after this
        // one in the batch would fail for the same reason, so stop this tick entirely and
        // retry the whole batch (including this message) next tick, rather than spamming
        // identical failures down the list.
        this.logger.error(
          `failed to publish outbox message ${message.id}, will retry next tick: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: { publishedAt: new Date() },
      });
    }
  }

  // Keys by orderId when the payload has one, so a consumer partitioned by key sees every
  // event for one order in order. Falls back to the message's own id for any future event
  // type that isn't order-shaped.
  private partitionKey(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object' && 'orderId' in payload) {
      const { orderId } = payload;
      if (typeof orderId === 'string') {
        return orderId;
      }
    }
    return undefined;
  }
}
