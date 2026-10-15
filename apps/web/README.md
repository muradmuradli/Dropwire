# apps/web

Dropwire's frontend (Next.js, App Router). Currently a minimal placeholder — the real
drop/catalog/checkout UI will be dropped in from a Lovable-generated design in a later session.

```sh
pnpm --filter web run dev     # http://localhost:3100
```

Auth will be Authorization Code + PKCE against Keycloak (see `docs/auth.md`); the gateway is the
only backend this app talks to over HTTP. Config in `.env.example`.
