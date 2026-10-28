import { PackageX, TriangleAlert } from 'lucide-react';
import { listDrops, type Drop } from '../lib/catalog-api';
import { DropCard } from '../components/dw/drop-card';
import { EmptyState } from '../components/dw/bits';

// Drops change on their own schedule (opens/closes, new ones appear) — this page has to be
// rendered fresh per request, not statically cached at build time the way Next 16's Cache
// Components feature defaults to.
export const instant = false;

// Order drops like someone browsing a flash-sale calendar would want them: what's happening
// right now first, then what's coming, then what's already over.
const STATUS_ORDER: Record<Drop['status'], number> = { LIVE: 0, UPCOMING: 1, ENDED: 2 };

export default async function Home() {
  let drops: Drop[] | null = null;
  let error: string | null = null;

  try {
    drops = (await listDrops()).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  } catch (err) {
    error = err instanceof Error ? err.message : 'failed to load drops';
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Drops</h1>
        <p className="mt-1 text-muted-foreground">
          Limited releases, one window at a time. No queue skipping, no overselling.
        </p>
      </div>

      {error && (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load drops"
          body={`The catalog service didn't respond: ${error}`}
        />
      )}

      {!error && drops && drops.length === 0 && (
        <EmptyState
          icon={PackageX}
          title="Nothing dropping right now"
          body="Check back soon — new drops show up here the moment they're scheduled."
        />
      )}

      {!error && drops && drops.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {drops.map((drop) => (
            <DropCard key={drop.id} drop={drop} />
          ))}
        </div>
      )}
    </section>
  );
}
