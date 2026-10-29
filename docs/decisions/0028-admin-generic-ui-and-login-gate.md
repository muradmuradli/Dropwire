# 0028: A generic admin UI, and blocking non-admin login at Keycloak

## Context
Two corrections to `apps/admin` (scaffolded in [0027](0027-admin-app-and-reservation-failed-worklist.md)):
reusing the storefront's branded theme for an internal tool was the wrong call, and a
`customer`-only account could reach `apps/admin`, authenticate successfully, and only then see an
"access denied" page — not what was asked. A `customer`-only account shouldn't be able to sign in
to this client at all.

## Decision — UI
- **Replaced the copied storefront theme with a plain, neutral palette**: grayscale surfaces, a
  single blue `primary`/`ring` (a generic admin-dashboard accent), `--success`/`--warning`/`--info`
  kept (the `Pill` component still needs them) but recolored away from the brand hues. Dropped
  everything storefront-specific with no reason to exist here: the custom display font, the
  glow/hero/grid utilities and keyframes.
- **Light mode by default**, not dark (toggle still available) — more conventional for an admin
  dashboard, and visually distinguishes this app from the storefront at a glance.
- **Dropped the three Google Fonts** (Manrope/Bricolage/JetBrains Mono) — falls back to Tailwind's
  default system-font stack; a generic internal tool doesn't need brand typography.
- **A real hand-rolled left sidebar** (`components/sidebar.tsx`), replacing the top `AdminNav` —
  not shadcn's `Sidebar` primitive, which brings collapsible/mobile-sheet/cookie-persistence
  machinery this desktop-first internal tool doesn't need. `layout.tsx` is now a sidebar+content
  flex row instead of a stacked header+main.

## Decision — login gate
- **A copy of the realm's `browser` flow, `browser-admin-only`, bound only to the `dropwire-admin`
  client** via `authenticationFlowBindingOverrides` — `dropwire-web`'s login is completely
  untouched. Built via the Admin API (flow copy, then adding executions), not hand-written from
  scratch, so Keycloak validated the structure as it was built.
- **The role check lives inside the copied flow's `forms` subflow, as a sibling of `Username
  Password Form` and the OTP branch — not as a new top-level sibling.** This took two attempts to
  get right, and the failure is worth recording: Keycloak's `DefaultAuthenticationFlow` refuses to
  mix `ALTERNATIVE` executions with `REQUIRED`/`CONDITIONAL` ones at the same flow level — every
  top-level execution in `browser` (`Cookie`, `Identity Provider Redirector`, `Organization`,
  `forms`) is `ALTERNATIVE`. Adding a `CONDITIONAL` "deny if not admin" subflow as a *new top-level
  sibling* hit exactly that restriction and broke the flow outright (`AuthenticationFlowException`,
  confirmed in the Keycloak container's own log) — for **every** user on `dropwire-admin`, admins
  included, not just the customer this was meant to block. Nested one level down, inside `forms`,
  there's no conflict: that subflow's existing children (`Username Password Form` = `REQUIRED`,
  the OTP branch = `CONDITIONAL`) already mix those two freely, which is exactly the Keycloak-
  sanctioned pattern this reuses.
  - **Known, accepted trade-off from this placement**: a user with an existing Keycloak SSO session
    (e.g. a `customer` who signed into `dropwire-web` moments earlier) could in principle be
    silently re-authenticated to `dropwire-admin` via the top-level `Cookie` alternative, bypassing
    `forms` — and therefore this role check — entirely. Closing that gap properly means restructuring
    `browser-admin-only` so every top-level alternative funnels through one shared
    REQUIRED/CONDITIONAL tier, which means re-creating `forms`' already-nested OTP structure from
    scratch via the Admin API — not worth the risk of another flow outage for a gap this project's
    real security boundary (`RolesGuard`, independently verified by both `gateway` and `orders`)
    already closes anyway. This Keycloak gate is a UX/defense-in-depth improvement on top of that,
    not the only thing standing between a `customer` and the admin backend.
  - **Execution order inside a flow is not reliably "append = last."** Adding a child execution to
    a named subflow via the Admin API's "add execution by flow alias" endpoint was observed to
    reset that execution's priority to the *lowest* in its sibling group (i.e., it jumped to the
    front), not the end, at least once per subflow. Verified by re-fetching
    `GET .../authentication/flows/{flow}/executions` after every single write and comparing
    `level`/`index`, rather than assuming a write succeeded as intended — this is what caught both
    the top-level mixing mistake and the inner ordering issue before either reached the client
    binding. `raise-priority`/`lower-priority` reliably swap *adjacent* siblings one step at a time;
    deleting and re-adding an execution (so it's appended fresh against whatever remains) was more
    reliable than repeated priority nudges for fixing a two-item sibling order.
  - **Admin REST API tokens from the realm's bootstrap `admin`/`admin` password grant are
    short-lived** (well under a minute in practice here) — several calls failed with a bare `401`
    partway through this work for no other reason than the token had expired since the previous
    call. Fetching a fresh token immediately before each subsequent request (rather than reusing
    one across a multi-step sequence) avoided this.
- **Persisted into `infra/keycloak/realm-export.json`** via Keycloak's own `partial-export`
  endpoint (same method as the User Profile change in an earlier session), merging in only the new
  `authenticationFlows`/`authenticatorConfig` entries and the client's
  `authenticationFlowBindingOverrides` — not a wholesale re-export, to avoid disturbing the rest of
  the hand-curated file.

## Consequences
- **Verified for real** with actual Authorization Code + PKCE curl sessions (cookie jars, real
  form submissions to Keycloak's own `login-actions/authenticate` endpoint — the same technique
  this project used for the login-enumeration fix and the `backToLogin` message fix): `customer1`
  against `dropwire-admin` → a real `401` with Keycloak's own "Access denied" page, and the
  realm's own event log recording `error="access_denied"` for that username, never a redirect back
  to `apps/admin`. `admin1` against `dropwire-admin` → succeeds normally, a real redirect with an
  authorization code. `customer1` against `dropwire-web` → unaffected, succeeds normally — proving
  the override is scoped correctly.
- `apps/admin`'s existing client-side role check (`OrdersWorklist`/`Dashboard`'s "you don't have
  access" state) is now genuinely unreachable for a `customer`-only login, since they can no longer
  complete authentication at all — it's effectively dead code for that case now, but left in place
  as defense-in-depth UX for any future gap in the Keycloak-side gate, not removed.
