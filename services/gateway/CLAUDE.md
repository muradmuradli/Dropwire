# gateway

## Responsibility
Public HTTP entry point. Routes requests to catalog/orders/etc, validates JWTs issued by Keycloak
(JWKS, `passport-jwt` + `jwks-rsa`), and applies rate limiting.

**JWT verification is implemented** (`src/auth/`): `JwtStrategy` verifies signature/issuer against
Keycloak's JWKS endpoint, `JwtAuthGuard` protects routes, `@CurrentUser()` exposes
`{ userId, roles }` (no local user lookup — `sub` claim is the id), `@Roles()` + `RolesGuard` gate
admin-only routes. `src/me/me.controller.ts` (`GET /me`, `GET /me/admin-only`) is a throwaway
surface to exercise this. Rate limiting is not implemented yet. See `notes/AUTH.md` for a
step-by-step walkthrough of this code.

**Proxies to `orders` and `catalog`** (`src/orders-proxy/`, `src/catalog-proxy/`), matching
`docs/ARCHITECTURE.md`'s `web → gateway → {orders,catalog}` paths. Both are route-for-route, not a
generic reverse proxy, and share forwarding logic via `src/proxy/proxy.service.ts`'s
`ProxyService` — forwards the `Authorization` header unchanged (zero trust, `notes/LEARNING.md`
§5), passes the upstream's response back byte-for-byte via `@Res()` rather than re-wrapping it
through `AllExceptionsFilter`, and returns a `503` naming the upstream if it's unreachable.
- `OrdersProxyController` (`POST /orders`, `GET /orders/:orderId`) is guarded by `JwtAuthGuard` —
  rejects unauthenticated requests before ever calling out to `orders` (fail fast; confirmed by
  hand that `orders` still rejects bad tokens even when called directly, bypassing `gateway`
  entirely). `ORDERS_URL` (`.env.example`) points at it — `http://localhost:3003` locally.
- `CatalogProxyController` (`GET /products[?dropId=]`, `GET /products/:id`, `GET /drops`, `GET
  /drops/:id`) has **no** auth guard — `catalog`'s own routes don't have one either
  (`docs/decisions/0017` — product/drop browsing is public), so gateway doesn't invent a
  requirement the upstream doesn't have. Forwards the query string through for `?dropId=`.
  `CATALOG_URL` (`.env.example`) points at it — `http://localhost:3001` locally. Full reasoning in
  [`docs/decisions/0018`](../../docs/decisions/0018-gateway-catalog-proxy.md).

**Automated e2e coverage exists** (`test/me.e2e-spec.ts`): no live Keycloak needed — it spins up a
throwaway local HTTP server serving a JWKS response for an RSA key pair generated on the fly, points
`JwtStrategy` at it via `KEYCLOAK_URL`/`KEYCLOAK_REALM`, and signs test tokens with the matching
private key. Drives the real `JwtStrategy`/`JwtAuthGuard`/`RolesGuard` code (real JWKS fetch, real
RS256 verification) rather than mocking any of it away. Covers: no token, garbage token, wrong-key
token, valid token, and the admin-only route's 403/401/200 branches.

**`GET /metrics`** (Prometheus text format): default process metrics, `http_request_duration_seconds`
(covers proxy routes too — the whole forward-and-respond cycle counts as the request), and
`gateway_proxy_requests_total{service,status}` in `ProxyService` (`status` is the upstream's real
HTTP status, or `unreachable` on the `503` path). Full reasoning in
[`docs/decisions/0019`](../../docs/decisions/0019-prometheus-metrics.md).

## Events
Produces: none.
Consumes: none. (Gateway talks to other services synchronously over HTTP/gRPC, not via Kafka.)

## Data ownership
None — stateless. No database.

## Port
`3000` (see `.env.example`).
