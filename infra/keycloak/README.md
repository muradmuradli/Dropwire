# Keycloak realm

`realm-export.json` is auto-imported by the `keycloak` container on `docker compose up` (via
`--import-realm`). See `docs/auth.md` for the full auth flow.

Quick facts:
- Realm: `dropwire` (display name "Dropwire")
- Client: `dropwire-web` (public, PKCE S256, redirect to `http://localhost:3100/*`)
- Roles: `customer`, `admin`
- Test users: `customer1` / `customer1`, `admin1` / `admin1` (both passwords temporary)
- Login theme: `dropwire` (`themes/dropwire/login/`) — plain white background, no branding. A real
  design will replace it later; see `notes/AUTH.md`.
- Admin console: http://localhost:8080 (bootstrap admin `admin` / `admin`, set via compose env vars)

## Changing the realm after it already exists

`--import-realm` only imports a realm that doesn't already exist in `keycloak-db` — editing
`realm-export.json` once Keycloak has been started once does **not** apply the change. Either:
- recreate `keycloak-db` + `keycloak` from scratch (`docker compose down -v keycloak keycloak-db && docker compose up -d keycloak-db keycloak`) for a one-time local reset, or
- apply the specific change live via the Admin REST API (get an admin token from
  `/realms/master/protocol/openid-connect/token` with `client_id=admin-cli`, then `PUT
  /admin/realms/dropwire` with just the changed fields — it merges, it doesn't replace the whole
  realm). This is what was used to apply `loginTheme`/`displayName` without losing the existing
  client/users/roles.

Theme files under `themes/` are picked up without a realm re-import — just a container recreate to
attach the new/changed bind mount (`docker compose up -d keycloak`); Keycloak runs in `start-dev`
mode, so theme files aren't cached and edits apply on page reload after that.
