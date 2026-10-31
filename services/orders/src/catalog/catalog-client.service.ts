import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Direct service-to-service HTTP, not through gateway — same reasoning as the gRPC call to
// inventory: gateway exists for the frontends' JWT-bearing traffic, not internal calls, and
// catalog's GET /products/:id has no auth guard anyway (docs/decisions/0017), so there's nothing
// gained by routing through gateway here. See docs/decisions/0036.
@Injectable()
export class CatalogClient {
  constructor(private readonly config: ConfigService) {}

  // Returns false only on a definitive 404 (the product doesn't exist — deleted or never
  // existed). Any other non-2xx response, or the fetch itself failing, throws instead of
  // returning false — catalog being unreachable or erroring is "couldn't verify this order is
  // safe," not "confirmed this product is gone," and the caller needs to tell those apart.
  async productExists(productId: string): Promise<boolean> {
    const response = await fetch(`${this.catalogUrl()}/products/${productId}`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`catalog returned ${response.status} for product ${productId}`);
    }
    return true;
  }

  private catalogUrl(): string {
    return this.config.get<string>('CATALOG_URL') ?? 'http://localhost:3001';
  }
}
