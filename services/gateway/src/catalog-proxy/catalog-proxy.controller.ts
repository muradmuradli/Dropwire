import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';

// A thin, route-for-route pass-through to `catalog` — same pattern as OrdersProxyController,
// but deliberately with no JwtAuthGuard: catalog's own routes have no auth guard either
// (docs/decisions/0017 — product/drop browsing is public), so gateway shouldn't invent a
// requirement the upstream service doesn't have.
@Controller()
export class CatalogProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxy: ProxyService,
  ) {}

  @Get('products')
  listProducts(@Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'GET',
      `/products${this.queryString(request)}`,
      request,
      response,
    );
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'GET',
      `/products/${id}`,
      request,
      response,
    );
  }

  @Get('drops')
  listDrops(@Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(this.catalogUrl(), 'catalog', 'GET', '/drops', request, response);
  }

  @Get('drops/:id')
  getDrop(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'GET',
      `/drops/${id}`,
      request,
      response,
    );
  }

  private catalogUrl(): string {
    return this.config.get<string>('CATALOG_URL') ?? 'http://localhost:3001';
  }

  private queryString(request: Request): string {
    const queryIndex = request.originalUrl.indexOf('?');
    return queryIndex === -1 ? '' : request.originalUrl.slice(queryIndex);
  }
}
