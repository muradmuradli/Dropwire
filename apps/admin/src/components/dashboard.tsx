'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { useAdminOrdersApi } from '../lib/admin-orders-api';
import { ApiError } from '../lib/api-error';
import { EmptyState } from './bits';

export function Dashboard() {
  const { initialized, authenticated } = useRequireAuth();
  const { keycloak } = useAuth();
  const { listReservationFailed } = useAdminOrdersApi();

  const [needingAttention, setNeedingAttention] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = keycloak?.tokenParsed?.realm_access?.roles?.includes('admin') ?? false;

  useEffect(() => {
    if (!authenticated || !isAdmin) {
      return;
    }
    listReservationFailed()
      .then((orders) => setNeedingAttention(orders.length))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'failed to load the dashboard');
      });
    // listReservationFailed is a new function identity every render (closes over keycloak) —
    // this only needs to run once authentication/role are confirmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, isAdmin]);

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
          body="This account doesn't have the admin role. Sign in with an admin account."
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>

      {error && (
        <EmptyState icon={TriangleAlert} title="Couldn't load the dashboard" body={error} />
      )}

      {!error && (
        <Link
          href="/orders"
          className="block max-w-sm rounded-2xl border bg-card p-6 transition-colors hover:bg-accent/50"
        >
          <p className="text-sm text-muted-foreground">Orders needing attention</p>
          <p className="mt-1 text-4xl font-bold text-destructive">{needingAttention ?? '—'}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Stuck at Reservation Failed — view worklist →
          </p>
        </Link>
      )}
    </section>
  );
}
