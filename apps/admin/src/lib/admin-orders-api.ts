'use client';

// A hook, not plain functions — every admin route requires a verified JWT with the admin
// role, so these calls need useApiClient()'s token-attaching fetch, same reasoning as
// apps/web's orders-api.ts.
import { useApiClient } from './api-client';
import { throwIfNotOk } from './api-error';

export type OrderStatus = 'PLACED' | 'RESERVED' | 'CANCELLED' | 'RESERVATION_FAILED' | 'CONFIRMED';

export interface OrderItem {
  id: number;
  orderId: string;
  productId: string;
  quantity: number;
}

export interface AdminOrder {
  id: string;
  customerId: string;
  correlationId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export function useAdminOrdersApi() {
  const apiFetch = useApiClient();

  return {
    async listReservationFailed(): Promise<AdminOrder[]> {
      const response = await apiFetch('/admin/orders');
      await throwIfNotOk(response);
      return response.json() as Promise<AdminOrder[]>;
    },

    async retry(orderId: string): Promise<AdminOrder> {
      const response = await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/retry`, {
        method: 'POST',
      });
      await throwIfNotOk(response);
      return response.json() as Promise<AdminOrder>;
    },

    async cancel(orderId: string): Promise<AdminOrder> {
      const response = await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
      });
      await throwIfNotOk(response);
      return response.json() as Promise<AdminOrder>;
    },
  };
}
