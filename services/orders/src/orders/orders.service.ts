import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  InventoryServiceClient,
  ReservationStatus,
} from '../generated/proto/dropwire/inventory/v1/inventory';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_CLIENT } from './inventory-client.constant';

export interface PlaceOrderItem {
  productId: string;
  quantity: number;
}

export interface PlaceOrderInput {
  customerId: string;
  correlationId: string;
  items: PlaceOrderItem[];
}

@Injectable()
export class OrdersService implements OnModuleInit {
  private inventoryService!: InventoryServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_CLIENT) private readonly inventoryClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.inventoryService =
      this.inventoryClient.getService<InventoryServiceClient>('InventoryService');
  }

  async placeOrder(input: PlaceOrderInput) {
    if (input.items.length === 0) {
      throw new BadRequestException('an order needs at least one item');
    }

    const orderId = randomUUID();
    await this.prisma.order.create({
      data: {
        id: orderId,
        customerId: input.customerId,
        correlationId: input.correlationId,
        status: 'PLACED',
        items: { createMany: { data: input.items } },
      },
    });

    // order_id is the idempotency key inventory keys its reservation off (see
    // docs/decisions/0007) — generating it here, before the gRPC call, is what lets a retry
    // of this same request (same orderId) land on the same answer instead of reserving
    // twice. There's no retry loop here yet; a transport failure just leaves the order
    // PLACED, to be revisited once the rest of the saga (and its recovery story) exists.
    const reservation = await lastValueFrom(
      this.inventoryService.reserveStock({
        orderId,
        correlationId: input.correlationId,
        items: input.items,
      }),
    );

    const status =
      reservation.status === ReservationStatus.RESERVATION_STATUS_RESERVED
        ? 'RESERVED'
        : 'CANCELLED';
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: true },
    });

    return { order, reservation };
  }

  async getOrder(orderId: string) {
    return this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  }
}
