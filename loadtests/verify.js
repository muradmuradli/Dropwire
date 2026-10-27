#!/usr/bin/env node
// The actual assertion this whole load test exists to make: read inventory's real Postgres
// state (never k6's own self-reported counters, which only prove what the client *saw*, not
// what the database actually recorded) and confirm the sum of everything genuinely RESERVED
// never exceeds the product's real stock. Run after flash-sale.js.
const path = require('node:path');
const { PrismaClient } = require(
  path.join(__dirname, '..', 'services', 'inventory', 'generated', 'prisma'),
);

const PRODUCT_ID = process.env.LOADTEST_PRODUCT_ID || 'loadtest-flash-sale-product';

async function main() {
  const prisma = new PrismaClient();
  const stock = await prisma.stock.findUnique({ where: { productId: PRODUCT_ID } });
  if (!stock) {
    console.error(`no Stock row for productId=${PRODUCT_ID} — run seed.js first`);
    process.exit(1);
  }

  const items = await prisma.reservationItem.findMany({ where: { productId: PRODUCT_ID } });
  const reservedQuantity = items
    .filter((item) => item.status === 'RESERVED')
    .reduce((sum, item) => sum + item.quantity, 0);
  const outOfStockCount = items.filter((item) => item.status === 'OUT_OF_STOCK').length;

  console.log(`Stock.totalQuantity: ${stock.totalQuantity}`);
  console.log(`reservation attempts recorded: ${items.length}`);
  console.log(`  RESERVED: sum quantity = ${reservedQuantity}`);
  console.log(`  OUT_OF_STOCK: ${outOfStockCount}`);

  await prisma.$disconnect();

  if (reservedQuantity > stock.totalQuantity) {
    console.error(
      `FAIL: oversold by ${reservedQuantity - stock.totalQuantity} unit(s) — reserved ` +
        `${reservedQuantity} against a stock of ${stock.totalQuantity}`,
    );
    process.exit(1);
  }
  console.log(`PASS: reserved ${reservedQuantity} <= stock ${stock.totalQuantity}, never oversold`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
