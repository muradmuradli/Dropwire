import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProxyService } from '../proxy/proxy.service';

// Separate from OrdersProxyController deliberately, mirroring orders' own split between
// OrdersController and AdminOrdersController (docs/decisions/0027) — a different
// authorization model (role, not ownership), not just a different path on the same resource.
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxy: ProxyService,
  ) {}

  @Get()
  getOrders(@Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.ordersUrl(),
      'orders',
      'GET',
      `/admin/orders${this.queryString(request)}`,
      request,
      response,
    );
  }

  @Post(':orderId/retry')
  retry(@Param('orderId') orderId: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.ordersUrl(),
      'orders',
      'POST',
      `/admin/orders/${orderId}/retry`,
      request,
      response,
    );
  }

  @Post(':orderId/cancel')
  cancel(@Param('orderId') orderId: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.ordersUrl(),
      'orders',
      'POST',
      `/admin/orders/${orderId}/cancel`,
      request,
      response,
    );
  }

  private ordersUrl(): string {
    return this.config.get<string>('ORDERS_URL') ?? 'http://localhost:3003';
  }

  private queryString(request: Request): string {
    const queryIndex = request.originalUrl.indexOf('?');
    return queryIndex === -1 ? '' : request.originalUrl.slice(queryIndex);
  }
}
