export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Formats an ISO timestamp for a <input type="datetime-local"> value, in the browser's local
// timezone (which is what that input type expects/displays) — used to prefill the edit form
// with a drop's existing opensAt/closesAt.
export function toDateTimeInputValue(iso: string): string {
  const d = new Date(iso);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// A short relative label for the worklist ("14 minutes ago") — the exact timestamp is
// available via dateTime()/a title attribute if someone needs it, but a worklist is read at
// a glance, and "how long has this been stuck" matters more than the exact wall-clock time.
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
