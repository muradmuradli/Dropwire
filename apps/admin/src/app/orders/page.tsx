import { Suspense } from 'react';
import { OrdersWorklist } from '../../components/orders-worklist';

export const instant = false;

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
          Loading…
        </section>
      }
    >
      <OrdersWorklist />
    </Suspense>
  );
}
