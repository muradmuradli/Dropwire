import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { S3Service } from '../s3/s3.service';
import {
  CatalogService,
  type CreateDropInput,
  type CreateProductInput,
  type UpdateDropInput,
  type UpdateProductInput,
} from './catalog.service';

interface UploadUrlRequest {
  filename: string;
  contentType: string;
}

@Controller()
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly s3Service: S3Service,
  ) {}

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

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateProduct(@Param('id') id: string, @Body() body: UpdateProductInput) {
    return this.catalogService.updateProduct(id, body);
  }

  // Returns a presigned S3 PutObject URL for apps/admin to upload an image file directly to —
  // this never sees the file bytes itself. See docs/decisions/0030.
  @Post('products/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createProductUploadUrl(@Body() body: UploadUrlRequest) {
    return this.s3Service.createUploadUrl(body?.filename, body?.contentType);
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

  @Patch('drops/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateDrop(@Param('id') id: string, @Body() body: UpdateDropInput) {
    return this.catalogService.updateDrop(id, body);
  }
}
