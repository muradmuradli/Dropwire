import { Controller } from '@nestjs/common';
import {
  InventoryServiceController,
  InventoryServiceControllerMethods,
  ReleaseStockRequest,
  ReleaseStockResponse,
  ReserveStockRequest,
  ReserveStockResponse,
} from '../generated/proto/dropwire/inventory/v1/inventory';
import { ReservationService } from './reservation.service';

@Controller()
@InventoryServiceControllerMethods()
export class ReservationController implements InventoryServiceController {
  constructor(private readonly reservationService: ReservationService) {}

  reserveStock(request: ReserveStockRequest): Promise<ReserveStockResponse> {
    return this.reservationService.reserveStock(request);
  }

  releaseStock(request: ReleaseStockRequest): Promise<ReleaseStockResponse> {
    return this.reservationService.releaseStock(request);
  }
}
