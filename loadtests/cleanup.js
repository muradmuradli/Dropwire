#!/usr/bin/env node
// Removes everything seed.js/flash-sale.js created. Doesn't touch Redis directly — restart
// `inventory` afterward so its own onModuleInit reseed recomputes stock:{productId} from
// Postgres, the same way every other session's manual test cleanup has worked.
const path = require('node:path');
const { PrismaClient } = require(
  path.join(__dirname, '..', 'services', 'inventory', 'generated', 'prisma'),
);

const PRODUCT_ID = process.env.LOADTEST_PRODUCT_ID || 'loadtest-flash-sale-product';

async function main() {
  const prisma = new PrismaClient();
  const { count: itemCount } = await prisma.reservationItem.deleteMany({
    where: { productId: PRODUCT_ID },
  });
  const { count: reservationCount } = await prisma.reservation.deleteMany({
    where: { orderId: { startsWith: 'loadtest-' } },
  });
  const { count: stockCount } = await prisma.stock.deleteMany({ where: { productId: PRODUCT_ID } });
  console.log(
    `deleted ${itemCount} reservation item(s), ${reservationCount} reservation(s), ` +
      `${stockCount} stock row — restart inventory now so Redis reseeds without this product`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
