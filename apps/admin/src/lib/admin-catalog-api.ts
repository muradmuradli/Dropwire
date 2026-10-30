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

export interface UpdateDropInput {
  name?: string;
  opensAt?: string;
  closesAt?: string;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  dropId?: string;
}

// Absent fields are left unchanged; an explicit `null` on description/imageUrl/dropId clears
// it — same distinction catalog's own UpdateProductInput makes, see docs/decisions/0031.
export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  imageUrl?: string | null;
  dropId?: string | null;
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
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

    async updateDrop(id: string, input: UpdateDropInput): Promise<Drop> {
      const response = await apiFetch(`/drops/${encodeURIComponent(id)}`, {
        method: 'PATCH',
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

    async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
      const response = await apiFetch(`/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(response);
      return response.json() as Promise<Product>;
    },

    async deleteProduct(id: string): Promise<void> {
      const response = await apiFetch(`/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await throwIfNotOk(response);
    },

    // Returns a presigned S3 PutObject URL — the caller PUTs the file straight to uploadUrl
    // (not through gateway/catalog) and uses publicUrl as the product's imageUrl. See
    // docs/decisions/0030.
    async getUploadUrl(filename: string, contentType: string): Promise<PresignedUpload> {
      const response = await apiFetch('/products/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename, contentType }),
      });
      await throwIfNotOk(response);
      return response.json() as Promise<PresignedUpload>;
    },
  };
}
