import { Suspense } from 'react';
import { OrderTracker } from '../../../components/dw/order-tracker';

// Same reasoning as drops/[id] (docs/decisions/0023): an order's status changes on its own
// schedule (the saga updates it asynchronously), so this always has to be rendered per request,
// never statically prerendered.
export const instant = false;

export default async function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">
          Loading…
        </section>
      }
    >
      <OrderTracker orderId={id} />
    </Suspense>
  );
}
