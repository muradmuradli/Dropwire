import { Suspense } from 'react';
import { DropsPage } from '../../components/drops-page';

export const instant = false;

export default function Page() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
          Loading…
        </section>
      }
    >
      <DropsPage />
    </Suspense>
  );
}
