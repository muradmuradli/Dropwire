import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { StockService } from './stock.service';

interface SetStockRequest {
  productId: string;
  quantity: number;
}

@Controller()
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  setStock(@Body() body: SetStockRequest) {
    return this.stockService.setStock(body?.productId, body?.quantity);
  }
}
