'use client';

import { useEffect, useState } from 'react';
import { pad, splitDuration } from '../../lib/format';

export function Countdown({ target }: { target: string }) {
  const targetMs = new Date(target).getTime();
  // Starts `null` so the server-rendered markup and the first client render match (both show
  // the placeholder) — reading Date.now() during render would differ between server and client
  // and trip React's hydration mismatch warning.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    // A zero-delay timeout, not a direct setNow() call in the effect body — fires on the next
    // microtask (effectively immediate) while keeping every setState call inside a callback.
    const kickoff = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, []);

  if (now === null) {
    return <span className="font-mono tabular">--:--:--</span>;
  }

  const { d, h, m, s } = splitDuration(targetMs - now);
  return (
    <span className="font-mono tabular">
      {d ? `${d}d ` : ''}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
