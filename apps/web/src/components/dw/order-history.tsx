'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageSearch, TriangleAlert } from 'lucide-react';
import { useRequireAuth } from '../../lib/use-require-auth';
import { useOrdersApi, type Order } from '../../lib/orders-api';
import { ApiError } from '../../lib/api-error';
import { ORDER_STATUS_COPY } from '../../lib/order-status';
import { dateTime } from '../../lib/format';
import { EmptyState, Pill } from './bits';

export function OrderHistory() {
  const { initialized, authenticated } = useRequireAuth();
  const { listOrders } = useOrdersApi();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    listOrders()
      .then(setOrders)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'failed to load your orders');
      });
    // listOrders is a new function identity every render (closes over keycloak) — this only
    // needs to run once authentication is confirmed, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  if (!initialized || !authenticated) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
        Redirecting…
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Couldn't load your orders" body={error} />
      </section>
    );
  }

  if (!orders) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon={PackageSearch} title="Loading orders…" body="One moment." />
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={PackageSearch}
          title="No orders yet"
          body="Once you check out, your orders will show up here."
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold">Your orders</h1>
      <ul className="space-y-4">
        {orders.map((order) => {
          const copy = ORDER_STATUS_COPY[order.status];
          return (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="block rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{order.id}</span>
                  <Pill tone={copy.tone}>{copy.label}</Pill>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{dateTime(order.createdAt)}</span>
                  <span>
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
