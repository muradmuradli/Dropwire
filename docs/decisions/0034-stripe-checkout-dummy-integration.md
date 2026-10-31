# 0034: Stripe Checkout (test mode) replaces the dummy dice-roll payment

## Context
`payments` simulated a charge with a single `Math.random()` roll against `PAYMENT_FAILURE_RATE`
(`docs/decisions/0014`) — correct for exercising the saga's two branches, but there was no moment
that felt like paying: placing an order just silently resolved in the background. This replaces
that dice roll with a real (test-mode) Stripe Checkout Session, so the customer is actually
redirected to a payment page, same as a real flash-sale site — while keeping the rest of the saga
(`InventoryReserved` → ... → `PaymentConfirmed`/`PaymentFailed` → `OrderConfirmed`/`OrderCancelled`)
untouched.

## Decision

- **Hosted Stripe Checkout, not embedded Elements.** A redirect to Stripe's own page needs no
  card-handling code in this codebase at all and is the simplest real integration — the trade-off
  (a round trip away from the site and back) is exactly what the user asked for ("customer is
  redirected to the checkout page").

- **`payments` still owns the whole payment side**, unchanged in shape: it still consumes
  `InventoryReserved`, still writes a `PENDING` `Payment` row first (`orderId` as the idempotency
  key, `docs/decisions/0014`), and still ends at `CONFIRMED`/`FAILED` via the same outbox. The only
  thing that changed is *what* drives that transition — a verified Stripe webhook instead of
  `Math.random()`. `handleInventoryReserved` itself no longer reaches a terminal state; it only
  gets as far as creating the Checkout Session (`Payment.checkoutSessionId`/`checkoutUrl`, new
  nullable columns). Two new idempotency guards on redelivery: a terminal `Payment` is still a
  no-op as before, and now a `PENDING` `Payment` that already has a `checkoutSessionId` is *also*
  a no-op (otherwise a redelivered `InventoryReserved` would mint a second, orphaned Stripe
  session). The narrow case this doesn't fully close — two redeliveries processed concurrently,
  both reading `checkoutSessionId: null` before either writes — is accepted, not engineered
  around: the result is at worst one unused extra Stripe session, not a double charge or bad data
  in this app's own tables.

- **A dummy, flat per-unit price — there is no real price anywhere in this saga to charge.**
  Neither `OrderItem` (orders) nor `InventoryReserved`'s payload carries a price; `inventory` has
  no price concept at all, and threading real catalog prices through the saga (a new synchronous
  lookup, or snapshotting price onto `OrderItem` at placement time) is a meaningfully bigger task
  than "wire a dummy Stripe," out of scope here. Each reserved item becomes one Stripe line item
  named `Product <productId>`, quantity from the event, priced at a flat
  `STRIPE_DUMMY_UNIT_PRICE_CENTS` (default `500`) — scales with cart size without pretending to be
  a real price.

- **A new event, `PaymentCheckoutCreated` (`payment.checkout_created`), carries the checkout URL
  from `payments` to `orders`**, which stores it on `Order.checkoutUrl` (new nullable column).
  Considered instead: a new public read endpoint on `payments` for the frontend to poll directly.
  Rejected — it would need its own ownership check (whose order is this?), which `payments` can't
  do today (no `customerId` on `Payment`), while `orders`' existing `GET /orders/:orderId` already
  does that check and the frontend already polls it. One more saga event, consumed by the same
  `OrderEventsConsumer` that already handles `PaymentConfirmed`/`PaymentFailed`, was the smaller
  change. It isn't a status transition — the order stays `RESERVED` — so `handleCheckoutCreated`
  writes no outbox event, just the URL, guarded by the same "only while still `RESERVED`" check as
  the real transitions so a late event can't resurrect a URL on an order that already moved on.

- **Stripe calls `payments` directly on its own port, not through `gateway`.** `gateway`'s proxies
  exist for the two frontends' JWT-bearing traffic (`services/gateway/CLAUDE.md`); a webhook has no
  JWT and no customer — its authenticity comes from the `Stripe-Signature` header instead, verified
  with `STRIPE_WEBHOOK_SECRET` before anything in the payload is trusted. Locally, the Stripe CLI
  (`stripe listen --forward-to localhost:3004/webhooks/stripe`) forwards straight to `payments`.

- **`rawBody: true` on `payments`' Nest app**, not a custom body-parser — the one documented way to
  get the exact raw bytes `stripe.webhooks.constructEvent` needs for signature verification
  without disabling or reordering the default JSON body parsing every other route still needs.

- **The frontend redirect lives on the existing order-tracking page (`OrderTracker`), not the
  checkout page.** Placing an order still routes to `/orders/:id` exactly as before; that page
  already polls `GET /orders/:orderId`, so it's also the natural place to notice `checkoutUrl`
  appear and redirect the browser there. Stripe's `success_url`/`cancel_url` both point back at
  that same page, with `?checkout=success`/`?checkout=cancelled` appended — the one thing that
  needed solving was *not* redirecting straight back to Stripe on that return trip: the component
  only auto-redirects when that query param is absent (i.e. this is the first, forward visit, not
  a return from Stripe). A `?checkout=cancelled` return with the order still `RESERVED` shows a
  "you left checkout" message and a "Retry payment" button reusing the same `checkoutUrl` (Stripe
  Checkout Sessions stay valid for a while after being abandoned, not just until first visit).

- **No AWS-style "I won't call the real API" constraint here** — Stripe's test mode is free, and
  the user explicitly chose the same env-var-placeholder treatment as the S3 integration
  (`docs/decisions/0030`) for a different reason: it's *their* Stripe account, not a shared one, so
  only they can provide a real test secret key. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` ship
  blank; `StripeService` constructs its Stripe client lazily (same reasoning as `S3Service`) so the
  service boots fine either way, and nothing here was verified against Stripe's real API.

## Consequences
- `Payment` gains `checkoutSessionId`/`checkoutUrl` (nullable); `Order` gains `checkoutUrl`
  (nullable) — both via real Prisma migrations.
- `payment.service.spec.ts` rewritten for the new shape (Checkout Session creation, redelivery
  guards, webhook-driven confirm/fail); new `stripe.service.spec.ts` and
  `stripe-webhook.controller.spec.ts`. `order-events.consumer.spec.ts`/`orders.service.spec.ts`
  gained coverage for the new topic/handler.
- **Not verified against the real Stripe API** — `STRIPE_SECRET_KEY` is blank by design (see
  above). Verified instead: all unit tests (mocked Stripe client, mocked Prisma) for the new
  branching/idempotency logic, and that both `payments` and `orders` still build and boot. The user
  tests the real Stripe flow themselves once they add their own test-mode key and run
  `stripe listen` locally.
- `services/payments/CLAUDE.md`/`services/orders/CLAUDE.md` updated to describe the new flow;
  `PAYMENT_FAILURE_RATE` removed (no longer used — the dice roll is gone).
