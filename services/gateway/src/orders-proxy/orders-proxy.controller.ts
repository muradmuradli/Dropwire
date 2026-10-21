import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// A thin, route-for-route pass-through to `orders` — not a generic reverse proxy. Gateway's
// own JwtAuthGuard rejects unauthenticated requests before ever calling out (fail fast, one
// thing for external clients to authenticate against); the Authorization header is then
// forwarded unchanged so `orders` can verify the token again independently (zero trust — see
// notes/LEARNING.md §5). Uses @Res() to pass orders' response back byte-for-byte rather than
// re-wrapping it through gateway's own AllExceptionsFilter, which would double-nest orders'
// own error envelope.
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersProxyController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  placeOrder(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    return this.forward('POST', '/orders', request, response, body);
  }

  @Get(':orderId')
  getOrder(@Param('orderId') orderId: string, @Req() request: Request, @Res() response: Response) {
    return this.forward('GET', `/orders/${orderId}`, request, response);
  }

  private async forward(
    method: string,
    path: string,
    request: Request,
    response: Response,
    body?: unknown,
  ): Promise<void> {
    const ordersUrl = this.config.get<string>('ORDERS_URL') ?? 'http://localhost:3003';
    const correlationId =
      (request as Request & { id?: string }).id ??
      (request.headers['x-correlation-id'] as string | undefined);

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (request.headers.authorization) {
      headers.authorization = request.headers.authorization;
    }
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    let upstream;
    try {
      upstream = await fetch(`${ordersUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      response
        .status(503)
        .json({ error: { code: 503, message: 'orders service is unreachable', correlationId } });
      return;
    }

    const payload = await upstream.text();
    response.status(upstream.status);
    response.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
    response.send(payload);
  }
}
