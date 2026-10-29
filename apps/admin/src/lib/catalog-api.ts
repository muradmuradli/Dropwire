// Plain functions, not a hook — catalog's GET routes have no auth guard (docs/decisions/0017),
// same reasoning as apps/web's own catalog-api.ts. Callable from server or client components.
import { API_BASE_URL } from './config';
import { throwIfNotOk } from './api-error';

export type DropStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  dropId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Drop {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  createdAt: string;
  updatedAt: string;
  status: DropStatus;
  products: Product[];
}

export async function listDrops(): Promise<Drop[]> {
  const response = await fetch(`${API_BASE_URL}/drops`);
  await throwIfNotOk(response);
  return response.json() as Promise<Drop[]>;
}

export async function listProducts(): Promise<Product[]> {
  const response = await fetch(`${API_BASE_URL}/products`);
  await throwIfNotOk(response);
  return response.json() as Promise<Product[]>;
}
