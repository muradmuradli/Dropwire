# 0001: Kafka for inter-service events

## Context
The order saga (OrderPlaced → InventoryReserved → PaymentConfirmed → OrderConfirmed, with a
compensating failure path) spans four services that must stay loosely coupled and must not lose
events if a consumer is temporarily down.

## Decision
Use Kafka (KafkaJS via `@nestjs/microservices`) as the backbone for all saga events. Locally, Kafka
is provided by Redpanda — a single-container, Kafka-wire-compatible engine with no Zookeeper, chosen
for faster local startup; the client code is identical to talking to real Kafka.

## Consequences
- Services are decoupled in time: a consumer being down doesn't block the producer.
- Every consumer must be idempotent (dedupe by event `id`), since Kafka only guarantees at-least-once
  delivery.
- Synchronous, latency-sensitive calls (e.g. the immediate stock-reservation check) still use gRPC —
  Kafka is for the saga's event trail, not every inter-service call.
