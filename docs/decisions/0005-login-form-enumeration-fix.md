# 0005: Suppress per-field credential errors to prevent username enumeration

## Context
Keycloak's default login form shows a deliberately generic message for bad credentials —
`invalidUserMessage`, "Invalid username or password." — regardless of whether the username doesn't
exist or the password is wrong, specifically so the *text* never confirms whether an account exists.

That generic intent doesn't survive the DOM, though. Keycloak attaches the message to a specific
form field depending on which credential actually failed: to the `username` field when the username
doesn't exist, and to the `password` field when the username is correct but the password is wrong.
The attached field gets `aria-invalid="true"` and the error icon/outline; the other field doesn't.
Confirmed directly against the running realm (not theorized): submitting a bad username and a bad
password as two separate requests and diffing the raw HTML responses showed identical error *text*
in both cases, but a different field flagged as invalid each time — enough to enumerate valid
usernames by inspecting the page (dev tools, a script, an accessibility tree), not just by reading
the rendered message.

This isn't fixable with CSS. Hiding the icon visually would leave the underlying `aria-invalid`
difference and the different error-element IDs in the markup, which is what actually leaks — a
CSS-only fix would be security theater, not a fix.

## Decision
Override `login.ftl` (`infra/keycloak/themes/dropwire/login/login.ftl`) — previously inherited
unchanged from the `keycloak.v2` base theme. The override:

1. Checks whether the `username` or `password` field's error message is exactly
   `invalidUserMessage`'s text, regardless of which field Keycloak attached it to.
2. If so, suppresses the per-field attachment on *both* fields. This doesn't require touching
   `field.ftl` — its `@field.input`/`@field.password` macros already take a `fieldName` override
   parameter (normally used so `password-confirm` can surface an error tied to `password`), so
   passing a field name that never has an entry in `messagesPerField` is enough to make both fields
   render with no error state at all.
3. Renders one generic `.dw-alert.dw-alert-error` banner above the form instead, using the same
   message text, not tied to either field.

Every other field-level error (a blank required field, an invalid email format on the register page,
etc.) is untouched and still shows per-field as normal — those don't reveal whether an account
exists, so there's nothing to hide about them.

## Consequences
- Verified by submitting a wrong-username request and a wrong-password request against the live
  realm and diffing the two normalized responses: byte-for-byte identical except for the username
  input echoing back whatever was typed (expected UX, not a leak — the submitter already knows
  their own input).
- This is a presentation-layer fix only. It does not address **timing-based enumeration**: a
  nonexistent username is rejected after a fast lookup, while a wrong password is rejected only
  after Keycloak computes the full password hash (PBKDF2, deliberately slow), so the two cases are
  still distinguishable by response time alone, independent of anything in the DOM or message text.
  Closing that gap properly means making the "user not found" path do an equivalent dummy hash
  computation before rejecting — authentication-flow logic that lives in Keycloak's Java
  `UsernamePasswordForm` authenticator, not in theme templates, so it would need a custom
  Authenticator SPI provider (a JAR, built and deployed into the realm's auth flow) rather than
  anything in `infra/keycloak/themes/`. Treated as a known, accepted residual risk for now — out of
  scope for a theme-level fix, and a genuinely deep rabbit hole relative to how it'd actually be
  exploited (it needs a lot of precise, repeated network-timing samples; credential stuffing and
  phishing are far more common real attacks). The cheaper, currently-unused mitigation available is
  Keycloak's built-in brute-force protection (`bruteForceProtected`, off on this realm as of this
  writing) — doesn't close the timing gap itself, but caps how many samples an attacker could ever
  collect to exploit it.
