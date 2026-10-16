'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useAuth } from '../../lib/auth-context';
import { redirectToLogin } from '../../lib/keycloak-login';

function LoginContent() {
  const { keycloak, initialized, authenticated } = useAuth();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect');

  // If we got here because a protected page sent us here, skip straight back there once logged
  // in — a real login screen doesn't sit around showing you your own token.
  useEffect(() => {
    if (authenticated && redirectTarget) {
      router.replace(redirectTarget);
    }
  }, [authenticated, redirectTarget, router]);

  if (!initialized) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 dark:bg-black">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (authenticated && redirectTarget) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 dark:bg-black">
        <p className="text-zinc-500">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Dev login
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Not the real login screen — just enough to mint a token to paste into Postman while the
        backend auth is being built. Log in as <code>customer1</code>/<code>customer1</code> or{' '}
        <code>admin1</code>/<code>admin1</code>.
      </p>

      {!authenticated && (
        <button
          onClick={() => keycloak && void redirectToLogin(keycloak, resolvedTheme)}
          className="rounded-full bg-black px-5 py-2 text-background text-white dark:bg-white dark:text-black"
        >
          Log in
        </button>
      )}

      {authenticated && (
        <div className="flex w-full max-w-xl flex-col gap-3">
          <p className="text-zinc-700 dark:text-zinc-300">
            Logged in as <strong>{keycloak?.tokenParsed?.preferred_username}</strong> — roles:{' '}
            {keycloak?.tokenParsed?.realm_access?.roles.join(', ') ?? 'none'}
          </p>
          <label className="text-sm text-zinc-500">
            Access token (paste into Postman as <code>Authorization: Bearer &lt;token&gt;</code>)
          </label>
          <textarea
            readOnly
            value={keycloak?.token}
            rows={10}
            className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={() => void keycloak?.logout()}
            className="self-start rounded-full border border-zinc-400 px-5 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Log out
          </button>
        </div>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
