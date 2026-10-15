# notifications

## Responsibility
Consumes saga outcome events and logs/sends mock emails (order confirmation, order cancellation).
Pure consumer — produces no events and has no API other than its health check.

## Events
Produces: none.
Consumes: `OrderConfirmed` (`order.confirmed`), `OrderCancelled` (`order.cancelled`).

## Data ownership
None — stateless consumer. No database.

## Port
`3005` (see `.env.example`).
