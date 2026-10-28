# 0024: Product.imageUrl — a plain URL, no image storage

## Context
Both the home and drop-detail pages (`docs/decisions/0022`, `0023`) fell back to a generated
gradient tile because `catalog`'s `Product` had no image field at all. The user wanted to actually
see a product rendered with a real photo, and supplied one to use.

## Decision
- **`Product.imageUrl` is a plain nullable `String`**, not an uploaded/stored asset — this project
  has no image storage or CDN, and adding one wasn't what was asked. A product can still exist
  with no image (the frontend's `ProductArt` falls back to the existing gradient tile when
  `imageUrl` is null).
- **Rendered as a plain `<img>`, not `next/image`.** These are arbitrary external URLs the app
  doesn't own, not local/trusted assets — `next/image` would need every such domain allowlisted in
  `next.config.ts` for no real benefit here (no responsive resizing/optimization value for a
  single hotlinked product photo).
- **The home page's `DropCard` uses the drop's *first* product's image** (`drop.products[0]?.
  imageUrl`) as the card's hero art, since a `Drop` has many `Product`s (`docs/decisions/0017`)
  and the card can only show one image. The drop detail page shows each product's own image
  individually.

## Consequences
- Real migration (`20261031214933_add_product_image_url`), not a seed-only hack — every service
  that reads a `Product` (just `catalog` itself; nothing else touches this table) now carries the
  field for real, and `apps/web`'s `Product` type (`docs/decisions/0021`) was updated to match.
- **Verified for real against the live backend**: seeded a real drop/product with a real external
  image URL, confirmed `GET /drops/:id` through the actual `gateway` returns it, and confirmed
  both the home page and drop detail page render a real `<img>` tag with that exact `src` (not the
  gradient fallback) — checked via the rendered HTML directly, not assumed from the code.
- This drop/product was left seeded in the database (not cleaned up, unlike every other
  verification pass this session) — it's there specifically so the page has something real to
  look at in a browser.
