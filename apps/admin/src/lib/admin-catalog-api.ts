'use client';

// A hook, not plain functions — the two write routes require a verified JWT with the admin
// role, same reasoning as admin-orders-api.ts.
import { useApiClient } from './api-client';
import { throwIfNotOk } from './api-error';
import type { Drop, Product } from './catalog-api';

export interface CreateDropInput {
  name: string;
  opensAt: string;
  closesAt: string;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  dropId?: string;
}

export function useAdminCatalogApi() {
  const apiFetch = useApiClient();

  return {
    async createDrop(input: CreateDropInput): Promise<Drop> {
      const response = await apiFetch('/drops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(response);
      return response.json() as Promise<Drop>;
    },

    async createProduct(input: CreateProductInput): Promise<Product> {
      const response = await apiFetch('/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(response);
      return response.json() as Promise<Product>;
    },
  };
}
