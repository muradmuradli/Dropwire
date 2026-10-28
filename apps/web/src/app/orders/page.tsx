import { Suspense } from 'react';
import { OrderHistory } from '../../components/dw/order-history';

// OrderHistory leans on client-only hooks (usePathname via useRequireAuth) that can't resolve
// during prerendering — wrapping it in Suspense and setting instant = false (same pattern as
// orders/[id]) lets this stay a plain Server Component page.
export const instant = false;

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
          Loading…
        </section>
      }
    >
      <OrderHistory />
    </Suspense>
  );
}
