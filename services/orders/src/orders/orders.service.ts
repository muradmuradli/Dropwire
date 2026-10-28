import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { Counter } from 'prom-client';
import {
  InventoryServiceClient,
  ReservationStatus,
  ReserveStockResponse,
} from '../generated/proto/dropwire/inventory/v1/inventory';
import { Prisma } from '../../generated/prisma';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_CLIENT } from './inventory-client.constant';

const INVENTORY_CALL_ATTEMPTS = 3;
const INVENTORY_CALL_RETRY_DELAY_MS = 200;

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
  private readonly logger = new Logger(OrdersService.name);
  private inventoryService!: InventoryServiceClient;
  private readonly placedCounter: Counter<'status'>;
  private readonly sagaOutcomesCounter: Counter<'status'>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_CLIENT) private readonly inventoryClient: ClientGrpc,
    metrics: MetricsService,
  ) {
    this.placedCounter = new Counter({
      name: 'orders_placed_total',
      help: 'POST /orders outcomes, right after the synchronous ReserveStock call',
      labelNames: ['status'],
      registers: [metrics.registry],
    });
    this.sagaOutcomesCounter = new Counter({
      name: 'orders_saga_outcomes_total',
      help: 'Terminal saga outcomes reached via PaymentConfirmed/PaymentFailed',
      labelNames: ['status'],
      registers: [metrics.registry],
    });
  }

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
      reservation = await this.retryInventoryCall(() =>
        lastValueFrom(
          this.inventoryService.reserveStock({
            orderId,
            correlationId: input.correlationId,
            items: input.items,
          }),
        ),
      );
    } catch {
      // Every attempt failed at the transport level (inventory unreachable, timed out,
      // etc.) — not a business "no." Recording this honestly as its own terminal status,
      // rather than leaving the order silently stuck at PLACED, is as far as recovery goes
      // without the full saga orchestration (see docs/decisions/0012).
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'RESERVATION_FAILED' },
      });
      this.placedCounter.inc({ status: 'RESERVATION_FAILED' });
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
    this.placedCounter.inc({ status });

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

  private async retryInventoryCall<T>(call: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= INVENTORY_CALL_ATTEMPTS; attempt++) {
      try {
        return await call();
      } catch (error) {
        lastError = error;
        if (attempt < INVENTORY_CALL_ATTEMPTS) {
          await sleep(INVENTORY_CALL_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError;
  }

  async getOrder(orderId: string) {
    return this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  }

  // No pagination — a defensive cap, not real pagination machinery (same simplicity as
  // catalog's GET /products/GET /drops, which have none either).
  async getOrdersForCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Triggered by a consumed PaymentConfirmed event (see OrderEventsConsumer). The
  // conditional updateMany (not a plain update) is what makes this idempotent: it only
  // actually transitions — and only then writes the OrderConfirmed outbox row — if the
  // order is still RESERVED. A redelivered event for an order already CONFIRMED (or in any
  // other state) updates zero rows and is a safe no-op. See docs/decisions/0015.
  async handlePaymentConfirmed(correlationId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.error(`PaymentConfirmed for unknown order ${orderId}, dropping`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: orderId, status: 'RESERVED' },
        data: { status: 'CONFIRMED' },
      });
      if (result.count === 0) {
        this.logger.log(
          `order ${orderId} is not RESERVED; ignoring redelivered/duplicate PaymentConfirmed`,
        );
        return;
      }
      await tx.outboxMessage.create({
        data: this.buildOutboxMessageData('OrderConfirmed', correlationId, {
          orderId,
          customerId: order.customerId,
        }),
      });
      this.sagaOutcomesCounter.inc({ status: 'CONFIRMED' });
    });
  }

  // Triggered by a consumed PaymentFailed event. Releasing stock happens *before* the
  // database transition on purpose, same ordering principle as inventory's own
  // reserve-then-finalize flow: ReleaseStock is already idempotent (docs/decisions/0011),
  // so calling it again on a retry is always safe — whereas the reverse order (DB first,
  // then release) would risk a crash leaving the order CANCELLED while stock stays
  // reserved forever, with no sign anything's wrong.
  async handlePaymentFailed(correlationId: string, orderId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.error(`PaymentFailed for unknown order ${orderId}, dropping`);
      return;
    }

    await this.retryInventoryCall(() =>
      lastValueFrom(this.inventoryService.releaseStock({ orderId, correlationId })),
    );

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: orderId, status: 'RESERVED' },
        data: { status: 'CANCELLED' },
      });
      if (result.count === 0) {
        this.logger.log(
          `order ${orderId} is not RESERVED; ignoring redelivered/duplicate PaymentFailed`,
        );
        return;
      }
      await tx.outboxMessage.create({
        data: this.buildOutboxMessageData('OrderCancelled', correlationId, {
          orderId,
          customerId: order.customerId,
          reason,
        }),
      });
      this.sagaOutcomesCounter.inc({ status: 'CANCELLED' });
    });
  }

  // Matches contracts/events/envelope.schema.json — id/occurredAt/createdAt all come from
  // Prisma defaults, so this only needs to fill in the fields that vary per event.
  private buildOutboxMessageData(type: string, correlationId: string, payload: object) {
    return {
      type,
      version: 1,
      correlationId,
      payload: payload as Prisma.InputJsonValue,
    };
  }
}
