import Link from 'next/link';
import { Zap } from 'lucide-react';

// Same brand mark as apps/web's Logo — yellow square, lightning bolt — kept as-is here even
// though the rest of this app's theme is a plain neutral/blue admin palette, not the
// storefront's: it's the one thing meant to still read as "Dropwire" at a glance.
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-[oklch(0.86_0.22_128)] text-[oklch(0.18_0.03_128)]">
        <Zap className="h-4 w-4" fill="currentColor" />
      </span>
      Dropwire Admin
    </Link>
  );
}
