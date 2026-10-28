# 0022: Home/drops page — server-rendered, honest about what's real

## Context
First real page using the typed API client (`docs/decisions/0021`). The reference project
(`proj/dropwire-live`) models one `Drop` as one product with fake viewer counts, a "Notify me"
button, and an "oversells: 0" ticker — none of which this page should carry over as-is, since our
real `Drop` bundles many `Product`s (`docs/decisions/0017`) and none of those three features have
anything real behind them yet.

## Decision
- **A Server Component, not a client page.** `listDrops()` is a plain async function
  (`docs/decisions/0021`), so the whole page can fetch and render server-side with no loading
  spinner needed for the main content. `export const instant = false` opts it out of Next 16's
  static-prerendering default — drop data changes on its own schedule and has to be fetched fresh
  per request, not baked in at build time.
- **Only the countdown is a client component** (`components/dw/countdown.tsx`) — a small,
  isolated leaf, not the whole page. Starts at `null` so the server-rendered and first
  client-rendered output match (avoids a hydration-mismatch warning), then ticks for real once
  mounted.
- **Gradient tiles instead of product images**: `catalog`'s `Product` has no image field at all.
  `ArtTile` picks a deterministic gradient from a small fixed palette (built from the theme's own
  color tokens) by hashing the drop's id, so a card always looks the same rather than flickering
  between renders — a placeholder, not an attempt to fake a real photo.
- **The card shows item count + "from $lowest price"**, not one product's price — a direct
  consequence of a `Drop` actually containing multiple `Product`s in our model, unlike the
  reference project's flattened one-drop-one-product shape.
- **Left out entirely, not simplified**: live viewer counts (nothing tracks this), "Notify me"
  (no notification-signup capability exists), and any "oversells: 0" ticker (the real proof of
  that lives in the k6 load test, `docs/decisions/0020` — a frontend counter not backed by real
  data would just be fake marketing copy, which cuts against this project's whole "verify for
  real" discipline).
- **The empty state is real, not hypothetical**: catalog has zero drops in it right now (test
  data gets cleaned up after every session) — this is the actual state a fresh visitor sees today,
  not an edge case invented for completeness.

## Consequences
- **Verified for real against the live backend**: confirmed the genuine empty state renders
  cleanly, then seeded one `LIVE`, one `UPCOMING`, and one `ENDED` drop and confirmed each status's
  styling (pulsing `LIVE` badge, grayscale `ENDED` card, countdown placeholder on `UPCOMING`),
  correct sort order (live → upcoming → ended), correct lowest-price calculation across multiple
  products, correct item-count singular/plural, and that linking to a drop's detail page 404s as
  expected (that page doesn't exist yet — the next step). Test data cleaned up afterward.
- Hit a real Next.js 16 build error ("uncached or runtime data during prerendering") from fetching
  live data with no caching strategy declared — fixed with `export const instant = false`, not by
  adding a cache that would go stale.
- Hit a real `react-hooks/set-state-in-effect` lint error in the countdown's ticking effect — fixed
  by moving the initial `setNow` call behind a zero-delay `setTimeout` so every `setState` call is
  inside a callback, not directly in the effect body.
- **Not done**: the countdown's live ticking wasn't verified in an actual browser (no browser tool
  available this session) — only the server-rendered placeholder state was confirmed directly;
  the ticking logic itself is a small, standard `setInterval`/`useState` pattern.
