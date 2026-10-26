import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProxyService } from '../proxy/proxy.service';

// A thin, route-for-route pass-through to `orders` — not a generic reverse proxy. Gateway's
// own JwtAuthGuard rejects unauthenticated requests before ever calling out (fail fast, one
// thing for external clients to authenticate against); ProxyService forwards the
// Authorization header unchanged so `orders` can verify the token again independently
// (zero trust — see notes/LEARNING.md §5).
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxy: ProxyService,
  ) {}

  @Post()
  placeOrder(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.ordersUrl(),
      'orders',
      'POST',
      '/orders',
      request,
      response,
      body,
    );
  }

  @Get(':orderId')
  getOrder(@Param('orderId') orderId: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.ordersUrl(),
      'orders',
      'GET',
      `/orders/${orderId}`,
      request,
      response,
    );
  }

  private ordersUrl(): string {
    return this.config.get<string>('ORDERS_URL') ?? 'http://localhost:3003';
  }
}
