# Auth

Dropwire has no auth service of its own. [Keycloak](https://www.keycloak.org/) is the identity
provider; every backend service is a resource server that verifies JWTs locally.

## Realm

- Realm: `dropwire` (`infra/keycloak/realm-export.json`, auto-imported on `docker compose up`)
- Client: `dropwire-web` — public client, Authorization Code flow with PKCE (S256), no client secret
- Roles: `customer`, `admin`
- Test users: `customer1` / `customer1` (role `customer`), `admin1` / `admin1` (role `admin`) — both
  passwords are temporary and must be changed on first login

## Frontend flow (apps/web)

1. Redirect the browser to Keycloak's authorize endpoint with PKCE (code_verifier/code_challenge).
2. Keycloak redirects back to `apps/web` with an authorization code.
3. The frontend exchanges the code (+ code_verifier) for tokens directly with Keycloak — no backend
   client secret is ever needed, which is why PKCE is required for a public SPA client.
4. The access token is sent as a `Bearer` header on every request to the gateway.

## Backend verification

Every service (starting with the gateway) verifies the JWT locally against Keycloak's JWKS endpoint
using `passport-jwt` + `jwks-rsa`:

- Fetch/cache the signing keys from `{KEYCLOAK_URL}/realms/dropwire/protocol/openid-connect/certs`.
- Verify signature, `exp`, `iss`, and `aud`.
- Use the `sub` claim as the user id — there is no local user table anywhere in the system.
- Read roles from `realm_access.roles` for authorization.

This wiring will be implemented in the gateway in the next session; this session only documents the
intended flow and provisions the realm/client/roles/users.
