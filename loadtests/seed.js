#!/usr/bin/env node
// Seeds a dedicated product directly against inventory's own Postgres (no HTTP API exists
// for this — Stock rows are never created through a route, same as every other session's
// manual test seeding). Run against a live inventory-db; restart `inventory` afterward so
// ReservationService.onModuleInit reseeds Redis's stock:{productId} counter from this row —
// a freshly-created Stock row is invisible to a reservation attempt until that happens.
const path = require('node:path');
const { PrismaClient } = require(
  path.join(__dirname, '..', 'services', 'inventory', 'generated', 'prisma'),
);

const PRODUCT_ID = process.env.LOADTEST_PRODUCT_ID || 'loadtest-flash-sale-product';
const QUANTITY = Number(process.env.LOADTEST_STOCK_QUANTITY) || 50;

async function main() {
  const prisma = new PrismaClient();
  await prisma.stock.upsert({
    where: { productId: PRODUCT_ID },
    create: { productId: PRODUCT_ID, totalQuantity: QUANTITY },
    update: { totalQuantity: QUANTITY },
  });
  console.log(`seeded Stock(productId=${PRODUCT_ID}, totalQuantity=${QUANTITY})`);
  console.log('restart inventory now so it reseeds Redis from this row before running k6');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
