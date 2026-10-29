import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrdersService } from './orders.service';

const VALID_STATUSES: OrderStatus[] = [
  'PLACED',
  'RESERVED',
  'CANCELLED',
  'CONFIRMED',
  'RESERVATION_FAILED',
];

// Separate from OrdersController deliberately — this is a structurally different query
// (cross-customer, filtered by status) with a different authorization model (role, not
// ownership) from the customer-facing /orders routes. See docs/decisions/0027.
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getOrders(@Query('status') status?: string) {
    const resolved = status ?? 'RESERVATION_FAILED';
    if (!VALID_STATUSES.includes(resolved as OrderStatus)) {
      throw new BadRequestException(`unknown order status "${resolved}"`);
    }
    return this.ordersService.listByStatus(resolved as OrderStatus);
  }

  @Post(':orderId/retry')
  retry(@Param('orderId') orderId: string) {
    return this.ordersService.retryReservation(orderId);
  }

  @Post(':orderId/cancel')
  cancel(@Param('orderId') orderId: string) {
    return this.ordersService.cancelStuckOrder(orderId);
  }
}
