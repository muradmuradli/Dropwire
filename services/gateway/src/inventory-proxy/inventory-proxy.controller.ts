import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProxyService } from '../proxy/proxy.service';

// A thin, route-for-route pass-through to `inventory` — same pattern as CatalogProxyController.
// Admin-only, mirroring inventory's own guard on POST /stock (docs/decisions/0035). Every other
// path into `inventory` is the gRPC ReserveStock/ReleaseStock API, called directly by `orders`,
// not through `gateway` — this is the one HTTP route `inventory` has for a frontend to call.
@Controller()
export class InventoryProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxy: ProxyService,
  ) {}

  @Post('stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  setStock(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.inventoryUrl(),
      'inventory',
      'POST',
      '/stock',
      request,
      response,
      body,
    );
  }

  private inventoryUrl(): string {
    return this.config.get<string>('INVENTORY_URL') ?? 'http://localhost:3002';
  }
}
