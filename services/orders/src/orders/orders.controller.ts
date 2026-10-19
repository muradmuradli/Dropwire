import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { OrdersService, PlaceOrderItem } from './orders.service';

interface PlaceOrderBody {
  customerId: string;
  items: PlaceOrderItem[];
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  placeOrder(@Body() body: PlaceOrderBody, @Req() request: Request & { id?: string }) {
    const correlationId =
      request.id ?? (request.headers['x-correlation-id'] as string) ?? randomUUID();
    return this.ordersService.placeOrder({
      customerId: body.customerId,
      correlationId,
      items: body.items,
    });
  }

  @Get(':orderId')
  async getOrder(@Param('orderId') orderId: string) {
    const order = await this.ordersService.getOrder(orderId);
    if (!order) {
      throw new NotFoundException(`no order with id ${orderId}`);
    }
    return order;
  }
}
