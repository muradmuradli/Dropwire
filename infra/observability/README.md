# Observability (out of scope for now)

Prometheus, Grafana, and OpenTelemetry tracing will be added here in a later session. For now, every
service logs structured JSON (via `nestjs-pino`) with a `correlationId` field, which is enough to
follow a request/saga across logs manually.
