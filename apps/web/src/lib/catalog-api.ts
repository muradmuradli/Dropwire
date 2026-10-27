// Plain functions, not a hook — unlike orders, catalog's routes have no auth guard
// (docs/decisions/0017), so there's no token to inject and no reason to depend on Keycloak
// being initialized just to browse products. Callable from server or client components alike.
import { API_BASE_URL } from './config';
import { throwIfNotOk } from './api-error';

export type DropStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
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

export async function getDrop(id: string): Promise<Drop> {
  const response = await fetch(`${API_BASE_URL}/drops/${encodeURIComponent(id)}`);
  await throwIfNotOk(response);
  return response.json() as Promise<Drop>;
}

export async function listProducts(dropId?: string): Promise<Product[]> {
  const query = dropId ? `?dropId=${encodeURIComponent(dropId)}` : '';
  const response = await fetch(`${API_BASE_URL}/products${query}`);
  await throwIfNotOk(response);
  return response.json() as Promise<Product[]>;
}

export async function getProduct(id: string): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(id)}`);
  await throwIfNotOk(response);
  return response.json() as Promise<Product>;
}
