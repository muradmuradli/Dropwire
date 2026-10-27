import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Counter } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';
import {
  ReleaseStockRequest,
  ReleaseStockResponse,
  ReservationStatus as ProtoReservationStatus,
  ReserveStockItemResult,
  ReserveStockRequest,
  ReserveStockResponse,
} from '../generated/proto/dropwire/inventory/v1/inventory';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Prisma, ReservationItemStatus, ReservationStatus } from '../../generated/prisma';

interface LuaItemResult {
  productId: string;
  quantity: number;
  status: ReservationItemStatus;
  availableQuantity: number;
}

interface LuaReserveResult {
  status: ReservationStatus;
  items: LuaItemResult[];
}

const STATUS_TO_PROTO: Record<ReservationItemStatus | ReservationStatus, ProtoReservationStatus> = {
  RESERVED: ProtoReservationStatus.RESERVATION_STATUS_RESERVED,
  OUT_OF_STOCK: ProtoReservationStatus.RESERVATION_STATUS_OUT_OF_STOCK,
  PRODUCT_NOT_FOUND: ProtoReservationStatus.RESERVATION_STATUS_PRODUCT_NOT_FOUND,
  PENDING: ProtoReservationStatus.RESERVATION_STATUS_UNSPECIFIED,
  RELEASED: ProtoReservationStatus.RESERVATION_STATUS_UNSPECIFIED,
};

@Injectable()
export class ReservationService implements OnModuleInit {
  private readonly logger = new Logger(ReservationService.name);
  private readonly reservationsCounter: Counter<'status'>;
  private readonly releasesCounter: Counter<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    metrics: MetricsService,
  ) {
    this.reservationsCounter = new Counter({
      name: 'inventory_reservations_total',
      help: 'ReserveStock attempts by terminal status',
      labelNames: ['status'],
      registers: [metrics.registry],
    });
    this.releasesCounter = new Counter({
      name: 'inventory_releases_total',
      help: 'Stock actually released back via ReleaseStock',
      registers: [metrics.registry],
    });
  }

  // Redis is a performance cache over Postgres's durable stock ledger, not the source of
  // truth — reseed it from Postgres on every boot rather than trusting whatever (if
  // anything) survived in Redis.
  async onModuleInit() {
    const stocks = await this.prisma.stock.findMany();
    if (stocks.length === 0) {
      return;
    }

    const reservedByProduct = await this.prisma.reservationItem.groupBy({
      by: ['productId'],
      where: { status: 'RESERVED', reservation: { status: 'RESERVED' } },
      _sum: { quantity: true },
    });
    const reservedMap = new Map(
      reservedByProduct.map((row) => [row.productId, row._sum.quantity ?? 0]),
    );

    const pipeline = this.redis.pipeline();
    for (const stock of stocks) {
      const available = stock.totalQuantity - (reservedMap.get(stock.productId) ?? 0);
      pipeline.set(`stock:${stock.productId}`, available);
    }
    await pipeline.exec();
    this.logger.log(`Seeded Redis stock counters for ${stocks.length} product(s)`);
  }

  async reserveStock(request: ReserveStockRequest): Promise<ReserveStockResponse> {
    const existing = await this.getOrCreatePendingReservation(
      request.orderId,
      request.correlationId,
    );

    if (existing && existing.status !== 'PENDING') {
      if (existing.status === 'RELEASED') {
        throw new RpcException({
          code: GrpcStatus.FAILED_PRECONDITION,
          message: `order ${request.orderId} was already reserved and released; ReserveStock cannot run again for it`,
        });
      }
      return this.toReserveStockResponse(existing.status, existing.items);
    }

    // Either a fresh attempt, or a retry of one that crashed after writing PENDING but
    // before finalizing — reserveStock itself is idempotent on orderId, so it's safe to
    // run again either way.
    const itemsJson = JSON.stringify(
      request.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );
    const raw = await this.redis.reserveStock(request.orderId, itemsJson);
    const luaResult = JSON.parse(raw) as LuaReserveResult;

    await this.finalizeReservation(request.orderId, request.correlationId, luaResult);
    return this.toReserveStockResponse(luaResult.status, luaResult.items);
  }

  async releaseStock(request: ReleaseStockRequest): Promise<ReleaseStockResponse> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { orderId: request.orderId },
      include: { items: true },
    });

    if (reservation?.status === 'PENDING') {
      throw new RpcException({
        code: GrpcStatus.FAILED_PRECONDITION,
        message: `reservation for order ${request.orderId} is still pending; cannot release yet`,
      });
    }

    if (reservation?.status !== 'RESERVED') {
      // Nothing was ever reserved (not found / out of stock / product not found), or it's
      // already released — either way there's nothing left to give back.
      return { released: true };
    }

    await this.redis.releaseStock(request.orderId);
    this.releasesCounter.inc();
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { orderId: request.orderId },
        data: { status: 'RELEASED' },
      }),
      this.prisma.outboxMessage.create({
        data: this.buildOutboxMessageData('InventoryReleased', request.correlationId, {
          orderId: request.orderId,
          items: reservation.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      }),
    ]);
    return { released: true };
  }

  private async getOrCreatePendingReservation(orderId: string, correlationId: string) {
    try {
      await this.prisma.reservation.create({ data: { orderId, correlationId, status: 'PENDING' } });
      return null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.reservation.findUniqueOrThrow({
          where: { orderId },
          include: { items: true },
        });
      }
      throw error;
    }
  }

  private async finalizeReservation(orderId: string, correlationId: string, lua: LuaReserveResult) {
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.reservation.update({ where: { orderId }, data: { status: lua.status } }),
      this.prisma.reservationItem.createMany({
        data: lua.items.map((item) => ({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          status: item.status,
          availableQuantityAtCheck: item.availableQuantity,
        })),
      }),
    ];
    if (lua.status === 'RESERVED') {
      ops.push(
        this.prisma.outboxMessage.create({
          data: this.buildOutboxMessageData('InventoryReserved', correlationId, {
            orderId,
            items: lua.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          }),
        }),
      );
    }
    await this.prisma.$transaction(ops);
    this.reservationsCounter.inc({ status: lua.status });
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

  private toReserveStockResponse(
    status: ReservationStatus,
    items: Array<{
      productId: string;
      status: ReservationItemStatus;
      availableQuantity?: number;
      availableQuantityAtCheck?: number | null;
    }>,
  ): ReserveStockResponse {
    return {
      status: STATUS_TO_PROTO[status],
      items: items.map((item): ReserveStockItemResult => ({
        productId: item.productId,
        status: STATUS_TO_PROTO[item.status],
        availableQuantity: item.availableQuantity ?? item.availableQuantityAtCheck ?? 0,
      })),
    };
  }
}
