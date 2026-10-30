import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProxyService } from '../proxy/proxy.service';

// A thin, route-for-route pass-through to `catalog` — same pattern as OrdersProxyController.
// The GET routes deliberately have no guard: catalog's own GET routes don't have one either
// (docs/decisions/0017 — product/drop browsing is public), so gateway shouldn't invent a
// requirement the upstream service doesn't have. The two POST routes mirror catalog's own
// admin-only guard instead (docs/decisions/0029).
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

  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createProduct(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'POST',
      '/products',
      request,
      response,
      body,
    );
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateProduct(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'PATCH',
      `/products/${id}`,
      request,
      response,
      body,
    );
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteProduct(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'DELETE',
      `/products/${id}`,
      request,
      response,
    );
  }

  @Post('products/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createProductUploadUrl(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'POST',
      '/products/upload-url',
      request,
      response,
      body,
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

  @Post('drops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createDrop(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'POST',
      '/drops',
      request,
      response,
      body,
    );
  }

  @Patch('drops/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateDrop(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'PATCH',
      `/drops/${id}`,
      request,
      response,
      body,
    );
  }

  @Delete('drops/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteDrop(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    return this.proxy.forward(
      this.catalogUrl(),
      'catalog',
      'DELETE',
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
