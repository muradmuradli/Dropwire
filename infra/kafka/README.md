# Kafka infra (Redpanda)

Local Kafka is provided by [Redpanda](https://redpanda.com/) — a single container, Kafka-wire-compatible,
no Zookeeper required. It works unchanged with KafkaJS / `@nestjs/microservices`.

- Kafka API: `localhost:9092` (from host) / `redpanda:9092` (from other containers)
- Admin API: `localhost:9644`

No topics are created yet — that's deliberate; see `notes/LEARNING.md` (§5) for what a topic is. Redpanda
auto-creates a topic the first time something publishes to it, so once the saga events are actually
designed and a producer exists, you likely won't even need an explicit creation step. If you want
topics to exist ahead of time with specific settings (partitions, replication), you can create one
by hand to try it out:

```sh
docker exec dropwire-redpanda rpk topic create some-topic-name --partitions 3 --replicas 1
docker exec dropwire-redpanda rpk topic list
```
