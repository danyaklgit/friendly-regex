import { useEffect, useRef } from 'react';

export interface AutoRefreshOptions {
  enabled: boolean;
  intervalMs: number;
  onTick: () => void;
}

/**
 * Calls `onTick` every `intervalMs` while `enabled` and the document is
 * visible. Hiding the tab clears the interval (so no burst of queued ticks on
 * return); showing it again re-arms from zero. The latest `onTick` is always
 * the one called. Owns no state, so it never re-renders its host between
 * ticks (the "refreshed N s ago" caption keeps its own clock in LiveCaption).
 */
export function useAutoRefresh({ enabled, intervalMs, onTick }: AutoRefreshOptions): void {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const arm = () => {
      stop();
      if (document.visibilityState !== 'visible') return;
      id = setInterval(() => {
        if (document.visibilityState === 'visible') onTickRef.current();
      }, intervalMs);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', arm);
    };
  }, [enabled, intervalMs]);
}
