# Keycloak themes

Custom themes, mounted read-only into the `keycloak` container at `/opt/keycloak/themes`
(`docker-compose.yml`) alongside Keycloak's own built-in themes (which load from a bundled jar, not
this folder, so this mount only *adds* a theme, it doesn't hide anything built-in).

- `dropwire/login/` — the login theme set via the realm's `loginTheme`. Currently just a plain
  white background with the realm's display name as a text header; extends `keycloak.v2` (the
  default login theme) for everything else (registration, OTP, "forgot password", ...) rather than
  reimplementing those pages. See `notes/AUTH.md` for how this was built and why.
