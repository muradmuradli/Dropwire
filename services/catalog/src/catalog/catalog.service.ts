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

// All fields optional — a PATCH only touches what it includes. The nullable fields
// (description/imageUrl/dropId) use `| null` deliberately: `undefined`/absent means "leave
// unchanged", `null` means "clear it" — two different things a plain optional string can't
// distinguish on its own.
export interface UpdateDropInput {
  name?: string;
  opensAt?: string;
  closesAt?: string;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  dropId?: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  imageUrl?: string | null;
  dropId?: string | null;
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
    this.assertValidName(input?.name);
    const { opensAt, closesAt } = this.parseAndValidateWindow(input.opensAt, input.closesAt);

    return this.prisma.drop.create({
      data: { name: input.name, opensAt, closesAt },
    });
  }

  async updateDrop(id: string, input: UpdateDropInput): Promise<Drop> {
    const existing = await this.prisma.drop.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`no drop with id ${id}`);
    }

    const name = input.name ?? existing.name;
    this.assertValidName(name);
    const { opensAt, closesAt } = this.parseAndValidateWindow(
      input.opensAt ?? existing.opensAt.toISOString(),
      input.closesAt ?? existing.closesAt.toISOString(),
    );

    return this.prisma.drop.update({ where: { id }, data: { name, opensAt, closesAt } });
  }

  // Deleting a drop doesn't delete its products — the schema's onDelete: SetNull just clears
  // their dropId, so they become unassigned rather than disappearing.
  async deleteDrop(id: string): Promise<void> {
    const existing = await this.prisma.drop.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`no drop with id ${id}`);
    }
    await this.prisma.drop.delete({ where: { id } });
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    this.assertValidName(input?.name);
    this.assertValidPriceCents(input.priceCents);
    if (input.dropId !== undefined) {
      await this.assertDropExists(input.dropId);
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

  // Absent (undefined) fields are left as they were; an explicit `null` on description/
  // imageUrl/dropId clears it. See the UpdateProductInput comment for why that distinction
  // needs `undefined` specifically, not just falsy.
  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`no product with id ${id}`);
    }

    const name = input.name ?? existing.name;
    const priceCents = input.priceCents ?? existing.priceCents;
    const description = input.description === undefined ? existing.description : input.description;
    const imageUrl = input.imageUrl === undefined ? existing.imageUrl : input.imageUrl;
    const dropId = input.dropId === undefined ? existing.dropId : input.dropId;

    this.assertValidName(name);
    this.assertValidPriceCents(priceCents);
    // Only re-validate when dropId is actually changing to a new non-null value — if it's
    // unchanged, the drop it points at was already confirmed to exist when this field was
    // last set (a deleted drop clears it to null via onDelete: SetNull, so a non-null,
    // unchanged dropId is never dangling).
    if (dropId !== null && dropId !== existing.dropId) {
      await this.assertDropExists(dropId);
    }

    return this.prisma.product.update({
      where: { id },
      data: { name, description, priceCents, imageUrl, dropId },
    });
  }

  async deleteProduct(id: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`no product with id ${id}`);
    }
    await this.prisma.product.delete({ where: { id } });
  }

  private assertValidName(name: unknown): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
  }

  private assertValidPriceCents(priceCents: unknown): void {
    if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents <= 0) {
      throw new BadRequestException('priceCents must be a positive whole number');
    }
  }

  private parseAndValidateWindow(
    opensAtRaw: string,
    closesAtRaw: string,
  ): { opensAt: Date; closesAt: Date } {
    const opensAt = new Date(opensAtRaw);
    const closesAt = new Date(closesAtRaw);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException('opensAt and closesAt must be valid dates');
    }
    if (closesAt <= opensAt) {
      throw new BadRequestException('closesAt must be after opensAt');
    }
    return { opensAt, closesAt };
  }

  private async assertDropExists(dropId: string): Promise<void> {
    const drop = await this.prisma.drop.findUnique({ where: { id: dropId } });
    if (!drop) {
      throw new NotFoundException(`no drop with id ${dropId}`);
    }
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
