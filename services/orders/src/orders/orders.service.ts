import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  InventoryServiceClient,
  ReservationStatus,
  ReserveStockRequest,
  ReserveStockResponse,
} from '../generated/proto/dropwire/inventory/v1/inventory';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_CLIENT } from './inventory-client.constant';

const RESERVE_STOCK_ATTEMPTS = 3;
const RESERVE_STOCK_RETRY_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    this.assertValidInput(input);

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
    // docs/decisions/0007/0011) — generating it here, before the gRPC call, is what makes
    // retrying this same request (same orderId) safe: inventory either hasn't seen it yet,
    // or replays the exact same answer instead of reserving twice.
    let reservation: ReserveStockResponse;
    try {
      reservation = await this.reserveStockWithRetry({
        orderId,
        correlationId: input.correlationId,
        items: input.items,
      });
    } catch {
      // Every attempt failed at the transport level (inventory unreachable, timed out,
      // etc.) — not a business "no." Recording this honestly as its own terminal status,
      // rather than leaving the order silently stuck at PLACED, is as far as recovery goes
      // without the full saga orchestration (see docs/decisions/0012).
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'RESERVATION_FAILED' },
      });
      throw new ServiceUnavailableException(
        `could not reach inventory to reserve stock for order ${orderId}; check GET /orders/${orderId}`,
      );
    }

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

  private assertValidInput(input: PlaceOrderInput): void {
    if (typeof input?.customerId !== 'string' || input.customerId.trim().length === 0) {
      throw new BadRequestException('customerId is required');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('an order needs at least one item');
    }
    for (const item of input.items) {
      if (typeof item?.productId !== 'string' || item.productId.trim().length === 0) {
        throw new BadRequestException('every item needs a non-empty productId');
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          `quantity for product "${item.productId}" must be a positive whole number`,
        );
      }
    }
  }

  private async reserveStockWithRetry(request: ReserveStockRequest): Promise<ReserveStockResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RESERVE_STOCK_ATTEMPTS; attempt++) {
      try {
        return await lastValueFrom(this.inventoryService.reserveStock(request));
      } catch (error) {
        lastError = error;
        if (attempt < RESERVE_STOCK_ATTEMPTS) {
          await sleep(RESERVE_STOCK_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError;
  }

  async getOrder(orderId: string) {
    return this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  }
}
