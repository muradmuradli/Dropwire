import { CircleCheck, CircleX, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { OrderStatus } from './orders-api';
import type { Tone } from './tones';

// Only PLACED/RESERVED are actually non-terminal — orders consumes PaymentConfirmed/PaymentFailed
// asynchronously (docs/decisions/0015) and moves a RESERVED order to CONFIRMED or CANCELLED.
// PLACED is included as a defensive fallback even though placeOrder's synchronous response means
// a freshly-placed order is never left at PLACED by the time a page can load it.
export const NON_TERMINAL: OrderStatus[] = ['PLACED', 'RESERVED'];

export const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { label: string; body: string; icon: LucideIcon; tone: Tone }
> = {
  PLACED: {
    label: 'Placed',
    body: 'Your order was received and is being processed.',
    icon: Clock,
    tone: 'muted',
  },
  RESERVED: {
    label: 'Reserved — confirming payment',
    body: 'Stock is held for this order while payment is processed. This updates automatically.',
    icon: Clock,
    tone: 'info',
  },
  CONFIRMED: {
    label: 'Confirmed',
    body: 'Payment went through — this order is complete.',
    icon: CircleCheck,
    tone: 'success',
  },
  CANCELLED: {
    label: 'Cancelled',
    body: 'This order was cancelled and any held stock was released.',
    icon: CircleX,
    tone: 'danger',
  },
  RESERVATION_FAILED: {
    label: 'Reservation failed',
    body: "Inventory couldn't be reached in time to reserve stock for this order.",
    icon: TriangleAlert,
    tone: 'warning',
  },
};
