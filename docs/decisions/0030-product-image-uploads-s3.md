# 0030: Product image uploads via S3 (presigned URL)

## Context
`Product.imageUrl` was a plain text field in the admin create-product form — an admin typed in an
already-hosted URL. The user wants real image storage: upload a file in `apps/admin`, have it land
in S3, and use the resulting URL as `imageUrl`. This session wires up all the code; the user
creates the actual S3 bucket and fills in the credential env vars themselves, and tests a real
upload afterward — nothing here touches AWS, and nothing here is verified against real AWS.

## Decision
- **Presigned-URL upload, not a server-side proxy.** `catalog` (which owns `Product`) hands back a
  short-lived S3 presigned `PutObject` URL; `apps/admin` `PUT`s the file bytes *directly* to S3
  from the browser — `catalog` never sees the file. This is the standard AWS pattern specifically
  to avoid routing file bytes through your own server, and — this being an explicitly a learning
  project — a real pattern worth having rather than a shortcut. Generating a presigned URL is pure
  local SigV4 signing; the AWS SDK never contacts AWS to do it, so this works as soon as *some*
  credential values are present, real or not — the signature is only actually checked once S3
  itself receives the `PUT`.
- **New endpoint, `POST /products/upload-url`**, gated exactly like `POST /products`/`POST /drops`
  (`JwtAuthGuard`+`RolesGuard`+`@Roles('admin')`) — only an admin should be able to mint a
  write-capable URL into the bucket. Request `{ filename, contentType }`, response
  `{ uploadUrl, publicUrl }`. Validation matches `createProduct`'s hand-rolled style: non-empty
  `filename`, `contentType` must start with `image/`. `gateway`'s `CatalogProxyController` mirrors
  the same guard on a matching proxy route.
- **Object keys are `products/<uuid>-<sanitized-filename>`** — collision-proof without needing to
  know anything about the product yet, since the upload happens *before* the product is created.
- **Env vars, names only — values are the user's to fill in**: `AWS_REGION`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, and an optional
  `S3_PUBLIC_BASE_URL` (for a CDN/custom domain in front of the bucket — falls back to the
  standard `https://<bucket>.s3.<region>.amazonaws.com` form if unset). Left blank in both
  `catalog/.env.example` and `catalog/.env` — the service still boots fine without them; the AWS
  SDK only fails when a presign is actually attempted, not at startup.
- **`apps/admin`'s product form gets a real file input**, replacing the free-text "Image URL"
  field: on submit, request a presigned URL, `PUT` the file to it with the exact same
  `Content-Type` that was presigned (S3 rejects the signature otherwise), then create the product
  with the resulting `publicUrl`. No file selected → `imageUrl` stays `undefined`, same behavior as
  before.
- **A real prerequisite this can't set up**: the S3 bucket needs a CORS policy allowing `PUT` from
  `http://localhost:3101` (and wherever `apps/admin` is eventually deployed) for the browser-to-S3
  upload to succeed at all. That's bucket configuration on the AWS side — flagged here, not
  something this change can do without touching AWS, which was explicitly out of scope.

## Consequences
- **Tested, but not end-to-end.** Unit tests for `S3Service` mock the AWS signer entirely (same as
  every other external dependency this project mocks) — empty filename, non-`image/*` contentType,
  the key shape, and the `S3_PUBLIC_BASE_URL` override. `admin-write.e2e-spec.ts` gained a role-gate
  suite for the new route with `S3Service` swapped for a stub via `overrideProvider` — proves the
  auth/validation wiring without needing real-looking AWS credentials. **No test, and no manual
  check this session, ever calls real S3** — by explicit request, that verification is the user's,
  once the bucket exists.
- `apps/web`'s storefront is unaffected — `Product.imageUrl` is still just a plain nullable string
  on the wire; nothing about how it's *rendered* changed, only how an admin sets it.
