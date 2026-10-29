# apps/admin

Dropwire's internal admin console (Next.js, App Router) — a separately deployable app from the
customer-facing `apps/web`, with its own Keycloak client (`dropwire-admin`) and a different trust
boundary (every real action requires the `admin` realm role, enforced server-side by `gateway`/
`orders`/`catalog`).

```sh
pnpm --filter admin run dev     # http://localhost:3101
```

Talks to `gateway` only, same as `apps/web`. Config in `.env.example`. See
`docs/decisions/0027-admin-app-and-reservation-failed-worklist.md` for the reasoning behind this
app existing as its own deployable rather than a `/admin` section inside `apps/web`.
