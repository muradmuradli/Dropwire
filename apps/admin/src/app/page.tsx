import { Suspense } from 'react';
import { Dashboard } from '../components/dashboard';

// Dashboard leans on client-only hooks (usePathname via useRequireAuth) that can't resolve
// during prerendering — same Suspense + instant=false split apps/web uses for orders/[id].
export const instant = false;

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
          Loading…
        </section>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
