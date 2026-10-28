import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageX, TriangleAlert } from 'lucide-react';
import { getDrop, type Drop } from '../../../lib/catalog-api';
import { ApiError } from '../../../lib/api-error';
import { EmptyState, LiveDot, Pill, ProductArt } from '../../../components/dw/bits';
import { AddToCart } from '../../../components/dw/add-to-cart';
import { Countdown } from '../../../components/dw/countdown';
import { dateTime, money } from '../../../lib/format';

// Same reasoning as the home page (docs/decisions/0022): a drop's status/products can change
// independently of any build, so this has to be fetched fresh per request.
export const instant = false;

export default async function DropDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let drop: Drop | null = null;
  let error: string | null = null;
  try {
    drop = await getDrop(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    error = err instanceof Error ? err.message : 'failed to load this drop';
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All drops
      </Link>

      {error && (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load this drop"
          body={`The catalog service didn't respond: ${error}`}
        />
      )}

      {!error && drop && <DropDetail drop={drop} />}
    </section>
  );
}

function DropDetail({ drop }: { drop: Drop }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {drop.status === 'LIVE' && (
            <Pill tone="danger">
              <LiveDot /> Live now
            </Pill>
          )}
          {drop.status === 'UPCOMING' && <Pill tone="primary">Upcoming</Pill>}
          {drop.status === 'ENDED' && <Pill>Ended</Pill>}
        </div>
        <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">{drop.name}</h1>
        {drop.status === 'UPCOMING' && (
          <p className="text-muted-foreground">
            Opens in{' '}
            <span className="font-semibold text-primary">
              <Countdown target={drop.opensAt} />
            </span>{' '}
            · {dateTime(drop.opensAt)}
          </p>
        )}
        {drop.status === 'LIVE' && (
          <p className="text-muted-foreground">Closes {dateTime(drop.closesAt)}</p>
        )}
        {drop.status === 'ENDED' && (
          <p className="text-muted-foreground">Closed {dateTime(drop.closesAt)}</p>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">
          {drop.products.length} {drop.products.length === 1 ? 'item' : 'items'} in this drop
        </h2>
        {drop.products.length === 0 ? (
          <EmptyState
            icon={PackageX}
            title="No items yet"
            body="Products haven't been added to this drop yet."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {drop.products.map((product) => (
              <li key={product.id} className="flex gap-4 rounded-2xl border bg-card p-4">
                <ProductArt
                  imageUrl={product.imageUrl}
                  seedId={product.id}
                  alt={product.name}
                  className="h-20 w-20 shrink-0 rounded-xl"
                />
                <div className="flex flex-1 flex-col justify-between gap-1">
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    {product.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold tabular">{money(product.priceCents)}</span>
                    {drop.status === 'LIVE' && <AddToCart product={product} dropId={drop.id} />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
