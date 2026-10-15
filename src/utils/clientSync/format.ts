/**
 * Client Sync display formatting (spec 7.8). Every `...Utc` field is a real
 * instant, so `new Date(iso)` is correct; the page leaves `timeZone`
 * undefined to get the browser's local zone, tests pass 'UTC'.
 */

export const DASH = '—';

/** HH:mm:ss in local time; with `withDate` the date precedes as yyyy-MM-dd. Empty for null or malformed input. */
export function formatLocalTime(iso: string | null | undefined, withDate = false, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone });
  if (!withDate) return time;
  // en-CA renders yyyy-MM-dd.
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(d);
  return `${date} ${time}`;
}

/** "N s ago" under a minute (rounded down), then "N min ago". Empty for null or malformed input. */
export function formatAgo(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const seconds = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/** "N ms" under one second, otherwise "N.N s"; a dash for null. */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The portal's grouping with two decimals, prefixed by the side (CR / DR) when known. */
export function formatAmount(amount: number, side: string): string {
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return side ? `${side} ${num}` : num;
}

/** Groups in fours for chips and the accounts table; the list keeps IBANs compact. */
export function groupIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

export function accountChipName(iban: string, bankCode: string, accountName: string): string {
  return [groupIban(iban), bankCode, accountName].filter((part) => part.trim() !== '').join(' · ');
}

/** Indented JSON when the text parses, else the text as is (SWIFT blocks stay verbatim). */
export function prettyJson(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
