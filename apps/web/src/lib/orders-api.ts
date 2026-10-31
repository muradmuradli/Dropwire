'use client';

// A hook, unlike catalog-api's plain functions — every route here requires a verified JWT,
// so these calls need useApiClient()'s token-attaching fetch rather than a bare fetch.
import { useApiClient } from './api-client';
import { throwIfNotOk } from './api-error';

export type OrderStatus = 'PLACED' | 'RESERVED' | 'CANCELLED' | 'RESERVATION_FAILED' | 'CONFIRMED';

export interface OrderItem {
  id: number;
  orderId: string;
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  correlationId: string;
  status: OrderStatus;
  // Set once payments has a real Stripe Checkout Session for this order — null until then
  // (or if the order never got that far). See docs/decisions/0034.
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface PlaceOrderItem {
  productId: string;
  quantity: number;
}

// Mirrors inventory's ReservationStatus proto enum numerically (0 unspecified, 1 reserved, 2
// out of stock, 3 product not found) — `order.status` above is the one real UI code should
// read; this is only useful for a more specific "why" message on a CANCELLED order.
export interface PlaceOrderResult {
  order: Order;
  reservation: {
    status: number;
    items: Array<{ productId: string; status: number; availableQuantity: number }>;
  };
}

export function useOrdersApi() {
  const apiFetch = useApiClient();

  return {
    async placeOrder(items: PlaceOrderItem[]): Promise<PlaceOrderResult> {
      const response = await apiFetch('/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      await throwIfNotOk(response);
      return response.json() as Promise<PlaceOrderResult>;
    },

    async getOrder(orderId: string): Promise<Order> {
      const response = await apiFetch(`/orders/${encodeURIComponent(orderId)}`);
      await throwIfNotOk(response);
      return response.json() as Promise<Order>;
    },

    async listOrders(): Promise<Order[]> {
      const response = await apiFetch('/orders');
      await throwIfNotOk(response);
      return response.json() as Promise<Order[]>;
    },
  };
}
