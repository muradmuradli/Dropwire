import { cn } from 'cn';
import { toneClass, type Tone } from '../../lib/tones';

export function Pill({
  tone = 'muted',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full bg-destructive animate-live', className)} />
  );
}

// A handful of fixed, on-brand gradients (built from the theme's own color tokens, not random
// hues) — catalog has no product image URLs yet, so every card needs *some* visual, and picking
// deterministically by id means the same drop always looks the same rather than flickering
// between renders.
const GRADIENTS = [
  'linear-gradient(135deg, color-mix(in oklab, var(--primary) 35%, var(--background)), var(--background))',
  'linear-gradient(135deg, color-mix(in oklab, var(--info) 35%, var(--background)), var(--background))',
  'linear-gradient(135deg, color-mix(in oklab, var(--warning) 30%, var(--background)), var(--background))',
  'linear-gradient(135deg, color-mix(in oklab, var(--success) 30%, var(--background)), var(--background))',
  'linear-gradient(135deg, color-mix(in oklab, var(--destructive) 25%, var(--background)), var(--background))',
];

function hashIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

export function ArtTile({ id, className }: { id: string; className?: string }) {
  const gradient = GRADIENTS[hashIndex(id, GRADIENTS.length)];
  return <div className={cn('bg-muted', className)} style={{ backgroundImage: gradient }} />;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
