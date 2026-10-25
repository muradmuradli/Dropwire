import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

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
}
