# Keycloak realm

`realm-export.json` is auto-imported by the `keycloak` container on `docker compose up` (via
`--import-realm`). See `docs/auth.md` for the full auth flow.

Quick facts:
- Realm: `dropwire`
- Client: `dropwire-web` (public, PKCE S256, redirect to `http://localhost:3100/*`)
- Roles: `customer`, `admin`
- Test users: `customer1` / `customer1`, `admin1` / `admin1` (both passwords temporary)
- Admin console: http://localhost:8080 (bootstrap admin `admin` / `admin`, set via compose env vars)
