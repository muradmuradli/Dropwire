# 0006: Rate limiting (not constant-time auth) for login timing enumeration

## Context
[0005](0005-login-form-enumeration-fix.md) closed the DOM-level username leak (the error text was
already generic, but which *field* it attached to wasn't). A separate, deeper leak remained: a
nonexistent username is rejected after a fast user lookup, while a wrong password for a real
username is rejected only after Keycloak computes the full password hash (PBKDF2, deliberately
slow — that's what makes a password hash a password hash). That cost difference is measurable in
response time, independent of anything in the DOM or message text, and lets an attacker enumerate
valid usernames by sending many timed requests per candidate and comparing averages.

Three ways to address this were considered:

1. **Constant-time auth** — make the "user not found" path run an equivalent dummy hash before
   rejecting, so both cases cost the same regardless of outcome. This is the only option that
   actually closes the timing gap itself. It's also not reachable from theme files: the
   lookup-then-hash order lives in Keycloak's Java `UsernamePasswordForm` authenticator, so it
   would need a custom Authenticator SPI provider — a JAR, built and deployed into the realm's
   authentication flow — a different category of work from everything else in `infra/keycloak/`
   so far, and more than this project's threat model justifies.
2. **A delay/jitter proxy in front of Keycloak** — doesn't apply here. The frontend talks to
   Keycloak directly for the PKCE flow (see [0003](0003-keycloak-over-custom-auth.md)); there's no
   reverse proxy in that path to add a delay in, and introducing one just for this would be new
   infrastructure for a partial mitigation (adding noise narrows the gap but doesn't close it —
   enough samples still average it out).
3. **Rate limiting** — doesn't close the timing gap on any single request either, but caps how
   many timed samples an attacker can ever collect against a given username, which is what makes
   the statistical attack practical in the first place. Keycloak has this built in
   (`bruteForceProtected`) — zero new infrastructure, a realm setting away.

## Decision
Enable Keycloak's native brute-force detection (`bruteForceProtected: true`) at the realm level,
keeping its shipped defaults rather than inventing our own untested numbers:

| Setting | Value | What it does |
|---|---|---|
| `quickLoginCheckMilliSeconds` | 1000 | Attempts less than 1s apart count as a "quick" burst |
| `minimumQuickLoginWaitSeconds` | 60 | First wait applied once a quick burst is detected |
| `failureFactor` | 30 | Failures before the slower, escalating lockout path applies |
| `waitIncrementSeconds` / `maxFailureWaitSeconds` | 60 / 900 | How that escalating wait grows, capped at 15 min |
| `maxDeltaTimeSeconds` | 43200 | Failure count resets after 12h with no new failures |
| `permanentLockout` | **false** (deliberately not changed) | See below |

`permanentLockout` is explicitly left off. Dropwire has open registration
(`registrationAllowed: true`), so usernames aren't secret to begin with — turning on permanent
lockout would mean anyone who knows (or guesses) a real username could lock that person out
indefinitely just by submitting wrong passwords a few times, with no self-service recovery. That's
a worse, easier denial-of-service than the enumeration risk being mitigated here. Temporary
throttling gets the rate-limiting benefit without that trade.

## Consequences
- Verified directly against the running realm, not just toggled and assumed: fired repeated rapid
  failed logins against a real test user (`customer1`) via curl, confirmed via Keycloak's own
  `attack-detection` Admin API that the "quick" burst detector fired after only 3 real failures
  (`numFailures: 3`, `disabled: true`) — well before the 30-failure `failureFactor` threshold,
  which is the fast path that actually matters for a timing attack's rapid-fire request pattern.
- While the account was in that temporary-wait state, a request against it and a request against a
  freshly-tried nonexistent username came back at nearly identical response times (~0.10s vs
  ~0.11s, spot-checked, not a rigorous statistical study). Consistent with Keycloak short-circuiting
  further attempts during the wait window rather than re-running the password hash each time — a
  side effect that happens to narrow the per-request timing gap too, though that's not what this
  setting was chosen for and shouldn't be relied on as the actual fix.
- This does **not** close the timing gap on the first few requests before a burst is detected, or
  for slow/low-rate probing spread out past `maxDeltaTimeSeconds`. The underlying asymmetry (fast
  lookup vs. slow hash) is unchanged — rate limiting just bounds how many chances there are to
  measure it before the account starts throttling. Full closure is still only possible via option 1
  (constant-time auth), left out of scope per the trade-off above.
- Test-account brute-force state was cleared via the Admin API (`DELETE
  /admin/realms/dropwire/attack-detection/brute-force/users`) after testing so `customer1` isn't
  left locked out from this verification.
