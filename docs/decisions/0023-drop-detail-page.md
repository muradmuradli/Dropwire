# 0023: Drop detail page — informational only, no buy affordance yet

## Context
The home page's `DropCard` (`docs/decisions/0022`) already links to `/drops/[id]`, which 404'd
until now. The reference project's equivalent page (`routes/drops.$id.tsx`) bundles a buy button,
a variant selector, and the whole fake virtual-waiting-room modal into this same page — none of
which fit here yet: our `Product` has no variants, and cart/checkout (where a real buy action
belongs) is explicitly the next step, not this one.

## Decision
- **Purely informational this round**: drop header (name, status, open/close window, live
  countdown if `UPCOMING`) plus the real list of its `Product`s (name, description when present,
  price). No "Add to cart"/"Buy" button anywhere on this page yet.
- **Why no placeholder buy button**: a button that looks interactive but does nothing would be
  exactly the kind of fake affordance this project has deliberately avoided all session (no fake
  viewer counts, no fake "Notify me", no fake admin chaos panel). Real "buy" belongs with cart/
  checkout, where it'll actually do something.
- **A real `404`, via `notFound()`**, when `getDrop` returns `ApiError` with `status === 404` —
  not a custom "drop not found" `EmptyState` the way the reference project does it. Next's own
  404 handling is the correct tool here and needed no new code to style.
- Same `export const instant = false` as the home page, and the same reused `ArtTile`/`Pill`/
  `LiveDot`/`Countdown`/`EmptyState` components — no new presentational primitives needed.

## Consequences
- **Verified for real against the live backend**: a `LIVE` drop with two products (one with a
  description, one without — confirmed the description paragraph is correctly omitted when
  absent), an `UPCOMING` drop with zero products (confirmed the countdown renders *and* the
  zero-products `EmptyState` renders in the same page), an `ENDED` drop with one product
  (confirmed "Closed <date>" text), and an unknown drop id (confirmed a real `404` response, not
  a soft in-page message). Test data cleaned up afterward.
- **Not done**: no buy/add-to-cart action anywhere on this page — deliberate, see above. Also no
  product images (same gap as the home page, `docs/decisions/0022` — `catalog`'s `Product` has no
  image field).
