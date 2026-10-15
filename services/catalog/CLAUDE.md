# catalog

## Responsibility
Owns products and drops (what's for sale, when a drop opens/closes, pricing). Read-heavy; the
inventory service, not catalog, is the source of truth for available stock.

## Events
Produces: none yet.
Consumes: none yet.

## Data ownership
`catalog-db` (Postgres, port `5433` locally). Prisma schema currently has only a placeholder
`HealthCheck` model — real `Product`/`Drop` models come in the next session.

## Port
`3001` (see `.env.example`).
