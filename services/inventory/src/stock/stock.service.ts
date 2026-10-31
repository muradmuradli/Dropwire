import { BadRequestException, Injectable } from '@nestjs/common';
import { Stock } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Admin-facing, synchronous stock provisioning — see docs/decisions/0035. Called right after
// apps/admin creates a product in catalog, so there's no gap where a product is orderable in
// the storefront before inventory has ever heard of it (the gap this whole feature exists to
// close). Upsert, not a strict create: also doubles as a "set stock to this exact number" admin
// action for an existing product, and makes a client retry after a network blip safe.
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async setStock(productId: unknown, totalQuantity: unknown): Promise<Stock> {
    this.assertValidProductId(productId);
    this.assertValidQuantity(totalQuantity);

    const stock = await this.prisma.stock.upsert({
      where: { productId },
      create: { productId, totalQuantity },
      update: { totalQuantity },
    });

    // Mirrors ReservationService.onModuleInit's reseed math for this one product — almost
    // always 0 for a brand-new product (nothing could have reserved it yet), but this same
    // method also serves "update an existing product's stock," where it can't be assumed.
    const reserved = await this.prisma.reservationItem.aggregate({
      where: { productId, status: 'RESERVED', reservation: { status: 'RESERVED' } },
      _sum: { quantity: true },
    });
    const available = totalQuantity - (reserved._sum.quantity ?? 0);
    await this.redis.set(`stock:${productId}`, available);

    return stock;
  }

  private assertValidProductId(productId: unknown): asserts productId is string {
    if (typeof productId !== 'string' || productId.trim().length === 0) {
      throw new BadRequestException('productId is required');
    }
  }

  private assertValidQuantity(quantity: unknown): asserts quantity is number {
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException('quantity must be a non-negative whole number');
    }
  }
}
