import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService, PlaceOrderItem } from './orders.service';

interface PlaceOrderBody {
  items: PlaceOrderItem[];
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  placeOrder(
    @Body() body: PlaceOrderBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    const correlationId =
      request.id ?? (request.headers['x-correlation-id'] as string) ?? randomUUID();
    return this.ordersService.placeOrder({
      customerId: user.userId,
      correlationId,
      items: body.items,
    });
  }

  @Get(':orderId')
  async getOrder(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.ordersService.getOrder(orderId);
    if (!order) {
      throw new NotFoundException(`no order with id ${orderId}`);
    }
    if (order.customerId !== user.userId) {
      throw new ForbiddenException('this order does not belong to you');
    }
    return order;
  }
}
