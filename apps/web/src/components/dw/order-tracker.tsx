'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageSearch, TriangleAlert } from 'lucide-react';
import { useRequireAuth } from '../../lib/use-require-auth';
import { useOrdersApi, type Order } from '../../lib/orders-api';
import { ApiError } from '../../lib/api-error';
import { NON_TERMINAL, ORDER_STATUS_COPY } from '../../lib/order-status';
import { EmptyState } from './bits';
import { Button } from '../ui/button';

const POLL_INTERVAL_MS = 3000;

export function OrderTracker({ orderId }: { orderId: string }) {
  const { initialized, authenticated } = useRequireAuth();
  const { getOrder } = useOrdersApi();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await getOrder(orderId);
        if (cancelled) {
          return;
        }
        setOrder(result);
        setError(null);
        if (NON_TERMINAL.includes(result.status)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof ApiError ? err.message : 'failed to load this order');
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
    // getOrder is a new function identity every render (closes over keycloak) — polling keys off
    // orderId/authenticated only, re-running this on every render would restart the poll loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, orderId]);

  if (!initialized || !authenticated) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">
        Redirecting…
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Couldn't load this order" body={error} />
      </section>
    );
  }

  if (!order) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState icon={PackageSearch} title="Loading order…" body="One moment." />
      </section>
    );
  }

  const copy = ORDER_STATUS_COPY[order.status];
  const Icon = copy.icon;
  const polling = NON_TERMINAL.includes(order.status);

  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold">{copy.label}</h1>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
          </div>
        </div>

        {polling && (
          <p className="mt-3 text-xs text-muted-foreground">
            Checking for updates every few seconds…
          </p>
        )}

        <div className="mt-6 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Order</span>
            <span className="font-mono">{order.id}</span>
          </div>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>{item.productId}</span>
              <span>× {item.quantity}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Button asChild variant="secondary">
          <Link href="/">Back to drops</Link>
        </Button>
      </div>
    </section>
  );
}
