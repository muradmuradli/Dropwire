import Link from 'next/link';
import { cn } from 'cn';
import type { Drop } from '../../lib/catalog-api';
import { dateTime, money } from '../../lib/format';
import { Pill, LiveDot, ProductArt } from './bits';
import { Countdown } from './countdown';

function lowestPriceCents(drop: Drop): number | null {
  if (drop.products.length === 0) return null;
  return Math.min(...drop.products.map((product) => product.priceCents));
}

export function DropCard({ drop }: { drop: Drop }) {
  const from = lowestPriceCents(drop);

  return (
    <Link
      href={`/drops/${drop.id}`}
      className={cn(
        'group block overflow-hidden rounded-2xl border bg-card transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow',
        drop.status === 'ENDED' && 'opacity-60 grayscale hover:grayscale-0',
      )}
    >
      <div className="relative aspect-[4/3]">
        <ProductArt
          imageUrl={drop.products[0]?.imageUrl}
          seedId={drop.id}
          alt={drop.name}
          className="h-full w-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3">
          {drop.status === 'LIVE' && (
            <Pill tone="danger" className="bg-background/80 backdrop-blur">
              <LiveDot /> LIVE
            </Pill>
          )}
          {drop.status === 'UPCOMING' && (
            <Pill className="bg-background/80 backdrop-blur">Upcoming</Pill>
          )}
          {drop.status === 'ENDED' && <Pill className="bg-background/80 backdrop-blur">Ended</Pill>}
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
          {drop.products.length} {drop.products.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-lg font-semibold">{drop.name}</h3>
          {from !== null && <span className="font-mono font-semibold tabular">from {money(from)}</span>}
        </div>
        {drop.status === 'LIVE' && (
          <p className="text-sm text-muted-foreground">Closes {dateTime(drop.closesAt)}</p>
        )}
        {drop.status === 'UPCOMING' && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Opens in</span>
            <span className="font-semibold text-primary">
              <Countdown target={drop.opensAt} />
            </span>
          </div>
        )}
        {drop.status === 'ENDED' && (
          <p className="text-sm text-muted-foreground">Closed {dateTime(drop.closesAt)}</p>
        )}
      </div>
    </Link>
  );
}
