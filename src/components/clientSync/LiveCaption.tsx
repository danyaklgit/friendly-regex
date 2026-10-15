import { useEffect, useState } from 'react';
import { formatAgo } from '../../utils/clientSync/format';

interface LiveCaptionProps {
  generatedAtUtc: string | null;
  autoRefresh: boolean;
}

const NOW_TICK_MS = 5000;

/**
 * "Live, refreshed N s ago". Owns its own 5 s clock (and refreshes it on
 * returning to the tab) so the tick re-renders only this caption, never the
 * tab and its rows. Hidden while there is no valid generated time.
 */
export function LiveCaption({ generatedAtUtc, autoRefresh }: LiveCaptionProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const ago = formatAgo(generatedAtUtc, now);
  if (!ago) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span aria-hidden className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-green-500' : 'bg-border-strong'}`} />
      {`Live, refreshed ${ago}`}
    </span>
  );
}
