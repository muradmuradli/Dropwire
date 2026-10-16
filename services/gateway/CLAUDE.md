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

## Events
Produces: none.
Consumes: none. (Gateway talks to other services synchronously over HTTP/gRPC, not via Kafka.)

## Data ownership
None — stateless. No database.

## Port
`3000` (see `.env.example`).
