import { Injectable } from '@nestjs/common';
import { Drop, Product } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export type DropStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export type DropWithStatus = Drop & { status: DropStatus; products: Product[] };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(dropId?: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: dropId === undefined ? undefined : { dropId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async listDrops(): Promise<DropWithStatus[]> {
    const drops = await this.prisma.drop.findMany({
      include: { products: true },
      orderBy: { opensAt: 'asc' },
    });
    return drops.map((drop) => this.withStatus(drop));
  }

  async getDrop(id: string): Promise<DropWithStatus | null> {
    const drop = await this.prisma.drop.findUnique({
      where: { id },
      include: { products: true },
    });
    return drop === null ? null : this.withStatus(drop);
  }

  private withStatus(drop: Drop & { products: Product[] }): DropWithStatus {
    return { ...drop, status: this.dropStatus(drop, new Date()) };
  }

  // Derived, not stored — see the schema comment on Drop for why.
  private dropStatus(drop: Drop, now: Date): DropStatus {
    if (now < drop.opensAt) return 'UPCOMING';
    if (now >= drop.closesAt) return 'ENDED';
    return 'LIVE';
  }
}
