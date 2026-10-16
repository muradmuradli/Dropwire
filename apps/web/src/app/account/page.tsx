'use client';

import { useEffect, useState } from 'react';
import { useApiClient } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

interface Me {
  userId: string;
  roles: string[];
}

export default function AccountPage() {
  const { initialized, authenticated } = useRequireAuth();
  const apiFetch = useApiClient();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    apiFetch('/me')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`gateway responded ${res.status}`);
        }
        return res.json() as Promise<Me>;
      })
      .then(setMe)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'request failed'));
    // apiFetch is a new function identity every render (it closes over `keycloak`); re-running
    // this effect on every render would just re-fetch pointlessly, so it's intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  if (!initialized || !authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 dark:bg-black">
        <p className="text-zinc-500">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Account
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Placeholder page — proves the auth plumbing works end to end: this page redirected you to
        log in, and the data below was fetched from <code>GET /me</code> on the gateway using the
        access token, not read from the token locally.
      </p>
      {error && <p className="text-red-600 dark:text-red-400">Error: {error}</p>}
      {!error && !me && <p className="text-zinc-500">Loading…</p>}
      {me && (
        <pre className="rounded border border-zinc-300 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          {JSON.stringify(me, null, 2)}
        </pre>
      )}
    </main>
  );
}
