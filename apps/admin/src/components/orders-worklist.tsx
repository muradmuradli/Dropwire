'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, PackageSearch, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { useAdminOrdersApi, type AdminOrder } from '../lib/admin-orders-api';
import { ApiError } from '../lib/api-error';
import { timeAgo } from '../lib/format';
import { EmptyState, Pill } from './bits';
import { Button } from './ui/button';

export function OrdersWorklist() {
  const { initialized, authenticated } = useRequireAuth();
  const { keycloak } = useAuth();
  const { listReservationFailed, retry, cancel } = useAdminOrdersApi();

  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = keycloak?.tokenParsed?.realm_access?.roles?.includes('admin') ?? false;

  function load() {
    listReservationFailed()
      .then(setOrders)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'failed to load the worklist');
      });
  }

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    load();
    // listReservationFailed is a new function identity every render (closes over keycloak) —
    // this only needs to run once authentication is confirmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  if (!initialized || !authenticated) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
        Redirecting…
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access"
          body="This account doesn't have the admin role. Sign in with an admin account to see the worklist."
        />
      </section>
    );
  }

  async function handleRetry(orderId: string) {
    setActioningId(orderId);
    setNotice(null);
    try {
      const updated = await retry(orderId);
      if (updated.status === 'RESERVATION_FAILED') {
        setNotice(`Order ${orderId} is still unreachable — try again later.`);
      } else {
        setNotice(`Order ${orderId} resolved to ${updated.status}.`);
      }
      load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'retry failed');
    } finally {
      setActioningId(null);
    }
  }

  async function handleCancel(orderId: string) {
    setActioningId(orderId);
    setNotice(null);
    try {
      await cancel(orderId);
      setNotice(`Order ${orderId} cancelled.`);
      load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'cancel failed');
    } finally {
      setActioningId(null);
    }
  }

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Couldn't load the worklist" body={error} />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Orders needing attention</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Orders where inventory couldn&apos;t be reached to reserve stock — not a customer decline,
        just unresolved. Retry re-attempts the reservation; cancel gives up on the order (nothing
        was ever reserved, so there&apos;s nothing to release).
      </p>

      {notice && (
        <p className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {orders === null ? (
        <EmptyState icon={PackageSearch} title="Loading…" body="One moment." />
      ) : orders.length === 0 ? (
        <EmptyState icon={PackageSearch} title="All caught up" body="Nothing stuck right now." />
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm">{order.id}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    customer {order.customerId}
                  </span>
                </div>
                <Pill tone="warning">Failed {timeAgo(order.createdAt)}</Pill>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.productId} × {item.quantity}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={actioningId === order.id}
                  onClick={() => void handleRetry(order.id)}
                >
                  Retry reservation
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actioningId === order.id}
                  onClick={() => void handleCancel(order.id)}
                >
                  Cancel order
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
