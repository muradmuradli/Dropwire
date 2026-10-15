# Architecture

## Services

```mermaid
flowchart LR
  web["apps/web (Next.js)"]
  gw["gateway"]
  catalog["catalog"]
  inventory["inventory"]
  orders["orders"]
  payments["payments"]
  notifications["notifications"]
  kc["Keycloak"]
  kafka["Kafka (Redpanda)"]

  web -- "OIDC / PKCE" --> kc
  web -- "HTTPS" --> gw
  gw -- "JWT verify (JWKS)" --> kc
  gw -- "HTTP" --> catalog
  gw -- "HTTP" --> orders

  orders -- "gRPC ReserveStock" --> inventory
  orders -. "events" .-> kafka
  inventory -. "events" .-> kafka
  payments -. "events" .-> kafka
  kafka -. "events" .-> orders
  kafka -. "events" .-> inventory
  kafka -. "events" .-> payments
  kafka -. "events" .-> notifications

  catalog --- catalogDb[(catalog-db)]
  inventory --- inventoryDb[(inventory-db)]
  inventory --- redis[(Redis)]
  orders --- ordersDb[(orders-db)]
  payments --- paymentsDb[(payments-db)]
```

Each service owns its own Postgres database; there is no shared database and no service imports
another service's code. Cross-service contracts live in `contracts/` and are generated into each
consuming service.

## Saga flow

```mermaid
sequenceDiagram
  participant O as orders
  participant I as inventory
  participant P as payments
  participant N as notifications

  O->>I: OrderPlaced (event) / ReserveStock (gRPC)
  I->>O: InventoryReserved (event)
  O->>P: (payments consumes InventoryReserved)
  P->>O: PaymentConfirmed (event)
  O->>N: OrderConfirmed (event)

  Note over O,P: Failure path
  P->>O: PaymentFailed (event)
  O->>I: (orders triggers release)
  I->>O: InventoryReleased (event)
  O->>N: OrderCancelled (event)
```

See `docs/event-catalog.md` for the full topic/producer/consumer table and `docs/decisions/` for the
reasoning behind the major architectural choices.
