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

**Proxies to `orders`** (`src/orders-proxy/orders-proxy.controller.ts`) — the first real
routing/proxying this service does, matching `docs/ARCHITECTURE.md`'s `web → gateway → orders`
path. Route-for-route, not a generic reverse proxy (only `POST /orders` and `GET
/orders/:orderId` exist to forward). Guarded by the same `JwtAuthGuard` — rejects unauthenticated
requests before ever calling out to `orders` (fail fast), then forwards the `Authorization` header
unchanged so `orders` verifies the same token again independently (zero trust, `notes/LEARNING.md`
§5 — confirmed by hand that `orders` still rejects bad tokens even when called directly, bypassing
`gateway` entirely). Uses `@Res()` to pass `orders`' response back byte-for-byte rather than
re-wrapping it through `AllExceptionsFilter`, and returns `503` itself if `orders` is unreachable.
`ORDERS_URL` (`.env.example`) points at it — `http://localhost:3003` locally.

**Automated e2e coverage exists** (`test/me.e2e-spec.ts`): no live Keycloak needed — it spins up a
throwaway local HTTP server serving a JWKS response for an RSA key pair generated on the fly, points
`JwtStrategy` at it via `KEYCLOAK_URL`/`KEYCLOAK_REALM`, and signs test tokens with the matching
private key. Drives the real `JwtStrategy`/`JwtAuthGuard`/`RolesGuard` code (real JWKS fetch, real
RS256 verification) rather than mocking any of it away. Covers: no token, garbage token, wrong-key
token, valid token, and the admin-only route's 403/401/200 branches.

## Events
Produces: none.
Consumes: none. (Gateway talks to other services synchronously over HTTP/gRPC, not via Kafka.)

## Data ownership
None — stateless. No database.

## Port
`3000` (see `.env.example`).
