import { useState, useEffect } from 'react';

export function useTimeRemaining(expiresAt: number | null): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return '';
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `Session expires in ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
