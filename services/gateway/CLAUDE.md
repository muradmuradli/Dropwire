# gateway

## Responsibility
Public HTTP entry point. Routes requests to catalog/orders/etc, validates JWTs issued by Keycloak
(JWKS, `passport-jwt` + `jwks-rsa`), and applies rate limiting.

**JWT verification is implemented** (`src/auth/`): `JwtStrategy` verifies signature/issuer against
Keycloak's JWKS endpoint, `JwtAuthGuard` protects routes, `@CurrentUser()` exposes
`{ userId, roles }` (no local user lookup — `sub` claim is the id), `@Roles()` + `RolesGuard` gate
admin-only routes. `src/me/me.controller.ts` (`GET /me`, `GET /me/admin-only`) is a throwaway
surface to exercise this — there's no real routing/proxying to catalog/orders yet. Rate limiting is
not implemented yet. See `notes/AUTH.md` for a step-by-step walkthrough of this code.

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
