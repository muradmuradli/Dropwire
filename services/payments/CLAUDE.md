# payments

## Responsibility
Payment provider integration — real Stripe Checkout Sessions in test mode, not a real charge.
Consumes `InventoryReserved` via a real Kafka consumer (`src/payment/payment-events.consumer.ts`),
and on it, `PaymentService.handleInventoryReserved` creates a Stripe Checkout Session
(`src/stripe/stripe.service.ts`) priced with a flat dummy per-unit amount
(`STRIPE_DUMMY_UNIT_PRICE_CENTS` — there's no real price anywhere in this saga to charge yet), then
publishes `PaymentCheckoutCreated` via its own transactional outbox (`src/outbox/`, same pattern as
`inventory`'s — `docs/decisions/0013`) so `orders` can get the URL to the customer. The actual
terminal outcome (`PaymentConfirmed`/`PaymentFailed`) comes later, from a verified Stripe webhook
(`POST /webhooks/stripe`, `src/payment/stripe-webhook.controller.ts`) — this service's one HTTP
route, called by Stripe directly (its own port, not through `gateway`; authenticated by the
`Stripe-Signature` header, not a JWT) rather than by any frontend. `orderId` is the idempotency key
for the whole flow — a `Payment` row is written `PENDING` before the Checkout Session exists, same
shape as inventory's `Reservation` (`docs/decisions/0011`), so a redelivered Kafka message or
redelivered webhook is always a safe no-op, never a double session or a double charge. Full
reasoning (the original mock-provider design, why `orderId` over tracking event ids directly, why a
thrown processing error is left to retry but a malformed message is dropped, why raw `kafkajs` for
the consumer too) in
[`docs/decisions/0014`](../../docs/decisions/0014-payments-mock-provider.md); the Stripe swap-in
in [`docs/decisions/0034`](../../docs/decisions/0034-stripe-checkout-dummy-integration.md).
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` ship blank (`StripeService` constructs its client
lazily so the service still boots) — never called against the real Stripe API in this codebase;
the user fills in their own test-mode key and verifies the real flow themselves.

**`GET /metrics`** (Prometheus text format): default process metrics, `http_request_duration_seconds`,
and `payments_processed_total{status}` in `PaymentService` (`CONFIRMED`/`FAILED`, incremented once
per real webhook-driven resolution, never on a redelivered-event/webhook no-op). Full reasoning in
[`docs/decisions/0019`](../../docs/decisions/0019-prometheus-metrics.md).

## Events
Produces: `PaymentCheckoutCreated` (`payment.checkout_created`), `PaymentConfirmed`
(`payment.confirmed`), `PaymentFailed` (`payment.failed`).
Consumes: `InventoryReserved` (`inventory.reserved`) — triggers a Checkout Session attempt.

## Data ownership
`payments-db` (Postgres, port `5436` locally): `Payment` (one row per order, keyed on `orderId` —
also carries `checkoutSessionId`/`checkoutUrl` once a Checkout Session exists) and `OutboxMessage`
(the transactional outbox).

## Port
`3004` (see `.env.example`).
