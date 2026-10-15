# 0003: Keycloak instead of a custom auth service

## Context
Dropwire needs login, token issuance, and role-based access (customer vs admin) for the frontend and
every backend service. Building and securing a custom auth service (password storage, token signing,
refresh rotation, PKCE support) is a large surface area that isn't the point of this project.

## Decision
Use Keycloak as the identity provider. The Next.js frontend authenticates via Authorization Code +
PKCE directly against Keycloak. Every backend service is a stateless resource server that verifies
JWTs locally against Keycloak's JWKS endpoint (`passport-jwt` + `jwks-rsa`) — no service calls
Keycloak synchronously on the request path beyond key caching.

## Consequences
- No service stores or ever sees a password. There is no local `users` table anywhere — the JWT
  `sub` claim is the user id used for all ownership checks (e.g. "whose order is this").
- Adding a new service that needs auth only means adding JWT verification middleware, not talking to
  a bespoke internal auth API.
- Keycloak itself becomes a dependency that must be running and healthy; this is acceptable for a
  system already built around multiple independent services and infra containers.
