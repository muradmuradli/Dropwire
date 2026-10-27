// Flash-sale spike against inventory's real gRPC ReserveStock — directly, not through the
// full orders->inventory saga. This is deliberate: the root CLAUDE.md's actual claim is that
// *inventory* ("the service that must never oversell") doesn't oversell under concurrent
// load. Testing at inventory's own boundary isolates that exact claim from orders/payments/
// Kafka/auth, none of which affect whether two concurrent reservations can both succeed past
// the available stock. See docs/decisions/0020.
import grpc from 'k6/net/grpc';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const PRODUCT_ID = __ENV.LOADTEST_PRODUCT_ID || 'loadtest-flash-sale-product';
const INVENTORY_GRPC_URL = __ENV.INVENTORY_GRPC_URL || 'host.docker.internal:4002';
const PROTO_DIR = __ENV.PROTO_DIR || '/repo/contracts/proto/dropwire/inventory/v1';

const reserved = new Counter('flash_sale_reserved');
const outOfStock = new Counter('flash_sale_out_of_stock');
const unexpected = new Counter('flash_sale_unexpected');

const client = new grpc.Client();
client.load([PROTO_DIR], 'inventory.proto');

// One buyer = one VU = one iteration: simulates a burst of distinct real buyers all hitting
// "buy" at once, not one buyer retrying. VUS/ITERATIONS below is what actually sets the size
// of that burst relative to LOADTEST_STOCK_QUANTITY (see seed.js) — this executor just lets
// k6 ramp every VU up as fast as it can rather than pacing them.
export const options = {
  scenarios: {
    flash_sale: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS) || 300,
      iterations: 1,
      maxDuration: '60s',
    },
  },
};

export default function () {
  client.connect(INVENTORY_GRPC_URL, { plaintext: true });

  // Unique per (VU, run) — ReserveStock is idempotent on order_id (docs/decisions/0011), so a
  // reused id across VUs would make them all just replay one cached result instead of
  // genuinely racing each other for the same stock.
  const orderId = `loadtest-${__VU}-${Date.now()}`;
  const response = client.invoke('dropwire.inventory.v1.InventoryService/ReserveStock', {
    order_id: orderId,
    correlation_id: orderId,
    items: [{ product_id: PRODUCT_ID, quantity: 1 }],
  });

  check(response, { 'gRPC status is OK': (r) => r && r.status === grpc.StatusOK });

  const status = response && response.message ? response.message.status : undefined;
  if (status === 'RESERVATION_STATUS_RESERVED' || status === 1) {
    reserved.add(1);
  } else if (status === 'RESERVATION_STATUS_OUT_OF_STOCK' || status === 2) {
    outOfStock.add(1);
  } else {
    unexpected.add(1);
    console.error(`unexpected ReserveStock response: ${JSON.stringify(response && response.message)}`);
  }

  client.close();
}
