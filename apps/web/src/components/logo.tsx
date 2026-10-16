import Link from 'next/link';
import { Zap } from 'lucide-react';

export function Logo({ to = '/' }: { to?: '/' | '/admin' }) {
  return (
    <Link
      href={to}
      className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow">
        <Zap className="h-4 w-4" fill="currentColor" />
      </span>
      DROPWIRE
    </Link>
  );
}
