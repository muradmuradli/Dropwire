import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService, type CreateDropInput, type CreateProductInput } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  listProducts(@Query('dropId') dropId?: string) {
    return this.catalogService.listProducts(dropId);
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    const product = await this.catalogService.getProduct(id);
    if (!product) {
      throw new NotFoundException(`no product with id ${id}`);
    }
    return product;
  }

  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createProduct(@Body() body: CreateProductInput) {
    return this.catalogService.createProduct(body);
  }

  @Get('drops')
  listDrops() {
    return this.catalogService.listDrops();
  }

  @Get('drops/:id')
  async getDrop(@Param('id') id: string) {
    const drop = await this.catalogService.getDrop(id);
    if (!drop) {
      throw new NotFoundException(`no drop with id ${id}`);
    }
    return drop;
  }

  @Post('drops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createDrop(@Body() body: CreateDropInput) {
    return this.catalogService.createDrop(body);
  }
}
