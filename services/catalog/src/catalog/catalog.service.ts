import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Drop, Product } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export type DropStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export type DropWithStatus = Drop & { status: DropStatus; products: Product[] };

export interface CreateDropInput {
  name: string;
  opensAt: string;
  closesAt: string;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  dropId?: string;
}

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

  async createDrop(input: CreateDropInput): Promise<Drop> {
    if (typeof input?.name !== 'string' || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    const opensAt = new Date(input.opensAt);
    const closesAt = new Date(input.closesAt);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException('opensAt and closesAt must be valid dates');
    }
    if (closesAt <= opensAt) {
      throw new BadRequestException('closesAt must be after opensAt');
    }

    return this.prisma.drop.create({
      data: { name: input.name, opensAt, closesAt },
    });
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    if (typeof input?.name !== 'string' || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
      throw new BadRequestException('priceCents must be a positive whole number');
    }
    if (input.dropId !== undefined) {
      const drop = await this.prisma.drop.findUnique({ where: { id: input.dropId } });
      if (!drop) {
        throw new NotFoundException(`no drop with id ${input.dropId}`);
      }
    }

    return this.prisma.product.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl ?? null,
        dropId: input.dropId ?? null,
      },
    });
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
