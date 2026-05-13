import { useEffect, useRef, useState } from 'react';
import type { TaggingProgressEntry } from '../../types';
import { Tooltip } from '../shared/Tooltip';

interface TaggingStatsCellProps {
  entry: TaggingProgressEntry;
  /** Client-side timestamp (Date.now()) when this entry first appeared in a poll. Anchors "Elapsed". */
  firstSeenAt?: number;
  /** 1-based index of this job among all active tagging jobs. Optional. */
  jobPosition?: number;
  /** Total count of active tagging jobs across the Backlog. Optional. */
  jobCount?: number;
  /** Invoked when the operator clicks "Retry" on a FAILED row. Button hidden if omitted. */
  onRetry?: (entry: TaggingProgressEntry) => void;
}

/** Threshold (ms) after which a stalled-looking job (no progress) flips to an amber warning. */
const STALL_THRESHOLD_MS = 18_000;

/** Format milliseconds as "45s" / "4m 12s" / "1h 23m". Negative values clamp to 0s. */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

/** Month-day only, e.g. "Apr 15". */
function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Absolute,timestamp for tooltips: "Apr 15, 2026 · 11:44:09 AM". */
function formatDateTimeFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${date} · ${time}`;
}

/**
 * Format the API's StartedAt as a precise time-of-day ("11:44 AM") when the job started
 * today, or "Apr 14, 11:44 AM" when it's on a different day. Keeps the value directly
 * from the backend so operators can correlate with server-side logs.
 */
function formatAbsoluteTime(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date(now).toDateString();
  if (sameDay) return time;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

/** Relative-time string: "just now" / "4m ago" / "2h ago". Falls back to short date when older than today. */
function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = now - t;
  if (diff < 45_000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) {
    const sameDay = new Date(t).toDateString() === new Date(now).toDateString();
    if (sameDay) return `${Math.round(diff / 3_600_000)}h ago`;
  }
  return formatDateShort(iso);
}

/** Precise throughput for the power-user tooltip. */
function formatRatePrecise(processed: number, elapsedMs: number): string {
  if (elapsedMs <= 0 || processed <= 0) return '—';
  const perSec = (processed / elapsedMs) * 1000;
  const perMin = perSec * 60;
  return `${perMin.toFixed(1)} txn/min  ·  ${perSec.toFixed(2)} txn/s`;
}

type Staleness = 'fresh' | 'aging' | 'stale';

/** Age of a failure: drives how loud the red styling should be. */
function getStaleness(iso: string | null | undefined, now: number): Staleness {
  if (!iso) return 'fresh';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'fresh';
  const age = now - t;
  if (age < 60 * 60 * 1000) return 'fresh';      // < 1h — full alarm
  if (age < 24 * 60 * 60 * 1000) return 'aging'; // 1h-24h — subdued
  return 'stale';                                 // > 24h — nearly neutral
}

/**
 * Replaces the default Statistics cell for a Backlog row when a background tagging
 * job is active or has failed. Shows live progress, throughput, ETA, stall detection,
 * and — on failure — the backend-supplied error message and a retry affordance.
 */
export function TaggingStatsCell({ entry, firstSeenAt, jobPosition, jobCount, onRetry }: TaggingStatsCellProps) {
  // Smooth 1s ticker only while the job is live. Drives elapsed/ETA/relative-time updates.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (entry.Status !== 'IN_PROGRESS') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry.Status]);

  // Stall detection: remember when we last saw the processed count change.
  const stallRef = useRef<{ value: number; changedAt: number }>({
    value: entry.ProcessedTransactions,
    changedAt: Date.now(),
  });
  if (stallRef.current.value !== entry.ProcessedTransactions) {
    stallRef.current = { value: entry.ProcessedTransactions, changedAt: now };
  }
  const isStalled =
    entry.Status === 'IN_PROGRESS' &&
    now - stallRef.current.changedAt > STALL_THRESHOLD_MS;

  const [errorExpanded, setErrorExpanded] = useState(false);

  const isInProgress = entry.Status === 'IN_PROGRESS';
  const isFailed = entry.Status === 'FAILED';
  // Elapsed is anchored to when WE first observed this entry in a poll response —
  // the backend's StartedAt can be far older (queue time) which would mislead operators.
  // If firstSeenAt hasn't been recorded yet (first render before context updates), fall
  // back to `now` so Elapsed starts at zero and climbs from there.
  const elapsedAnchor = firstSeenAt ?? now;
  const elapsedEnd = isInProgress ? now : entry.CompletedAt ? new Date(entry.CompletedAt).getTime() : now;
  const elapsedMs = Math.max(0, elapsedEnd - elapsedAnchor);
  const pct = entry.TotalTransactions > 0
    ? Math.min(100, (entry.ProcessedTransactions / entry.TotalTransactions) * 100)
    : 0;
  const remaining = Math.max(0, entry.TotalTransactions - entry.ProcessedTransactions);

  const staleness = isFailed ? getStaleness(entry.CompletedAt, now) : 'fresh';

  // Colour / tone lookup keyed by state. Stale failures fade toward neutral so
  // the eye is drawn to fresh ones first.
  const tone = (() => {
    if (isStalled) {
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bar: 'bg-amber-400 dark:bg-amber-500',
        pillBg: 'bg-amber-500/5 border-amber-500/25',
        statusText: 'Stalled',
      };
    }
    if (isInProgress) {
      return {
        text: 'text-primary',
        bar: 'bg-primary',
        pillBg: 'bg-primary/5 border-primary/25',
        statusText: 'In progress',
      };
    }
    if (isFailed) {
      if (staleness === 'stale') {
        return {
          text: 'text-body-secondary',
          bar: 'bg-border-strong',
          pillBg: 'bg-surface-hover border-border',
          statusText: 'Failed',
        };
      }
      if (staleness === 'aging') {
        return {
          text: 'text-red-500/80 dark:text-red-400/80',
          bar: 'bg-red-400/70 dark:bg-red-500/70',
          pillBg: 'bg-red-500/[0.04] border-red-500/20',
          statusText: 'Failed',
        };
      }
      return {
        text: 'text-red-500 dark:text-red-400',
        bar: 'bg-red-400 dark:bg-red-500',
        pillBg: 'bg-red-500/5 border-red-500/25',
        statusText: 'Failed',
      };
    }
    return { text: 'text-body-secondary', bar: 'bg-primary', pillBg: '', statusText: '' };
  })();

  return (
    <div className="space-y-1.5 py-0.5">
      {/* Header row: status pill + progress bar + percentage */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap min-w-25 px-1.5 py-0.5 rounded-md border ${tone.pillBg} ${tone.text}`}
        >
          <StatusGlyph state={isStalled ? 'stalled' : isInProgress ? 'progress' : 'failed'} />
          <span>Tagging · {tone.statusText}</span>
          {(jobCount ?? 0) > 1 && jobPosition && (
            <Tooltip placement="top" content={`${jobCount} libraries tagging concurrently`}>
              <span className="ml-0.5 text-faint font-medium normal-case tracking-normal cursor-help">
                {jobPosition}/{jobCount}
              </span>
            </Tooltip>
          )}
        </span>

        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-tertiary relative">
          <div
            className={`h-full rounded-full ${tone.bar} transition-all duration-700 ease-out relative`}
            style={{ width: `${pct}%` }}
          >
            {isInProgress && !isStalled && pct > 0 && (
              <div className="absolute inset-0 stripes-live" aria-hidden />
            )}
          </div>
        </div>

        <span className={`text-xs font-semibold whitespace-nowrap tabular-nums ${tone.text}`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Phase message — a backend-supplied status hint like "Matching rules…" or "Extracting attributes…" */}
      {entry.PhaseMessage && (
        <p className={`text-[10px] italic truncate ${isFailed ? tone.text : 'text-body-secondary'}`}>
          {entry.PhaseMessage}
        </p>
      )}

      {/* IN_PROGRESS metrics — Processed + Started + Elapsed on one flex-wrap row that
          starts flush with the status pill and fills left-to-right. */}
      {isInProgress && (
        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-[10px]">
          <span className="inline-flex items-baseline gap-1">
            <span className="text-faint uppercase tracking-wide font-semibold">Processed</span>
            <span className="text-body-secondary font-medium tabular-nums">
              <span className="font-semibold text-heading">{entry.ProcessedTransactions.toLocaleString()}</span>
              <span className="text-faint"> / </span>
              {entry.TotalTransactions.toLocaleString()} txns
            </span>
          </span>
          <Separator />
          <MetaField label="Started" value={formatAbsoluteTime(entry.StartedAt, now)} />
          <Separator />
          <MetaField label="Elapsed" value={formatDuration(elapsedMs)} numeric />

          <Tooltip
            placement="top"
            content={
              <div className="space-y-1 min-w-56">
                <div className="flex justify-between gap-4">
                  <span className="text-faint uppercase tracking-wide text-[10px]">Started (API)</span>
                  <span className="font-mono text-[11px]">{formatDateTimeFull(entry.StartedAt)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-faint uppercase tracking-wide text-[10px]">Elapsed</span>
                  <span className="font-mono text-[11px]">{formatDuration(elapsedMs)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-faint uppercase tracking-wide text-[10px]">Remaining</span>
                  <span className="font-mono text-[11px]">{remaining.toLocaleString()} txns</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-faint uppercase tracking-wide text-[10px]">Throughput</span>
                  <span className="font-mono text-[11px]">{formatRatePrecise(entry.ProcessedTransactions, elapsedMs)}</span>
                </div>
                {isStalled && (
                  <div className="pt-1 mt-1 border-t border-gray-300 dark:border-gray-600 text-amber-600 dark:text-amber-400 text-[11px]">
                    No progress for {formatDuration(now - stallRef.current.changedAt)} — backend may be stalled.
                  </div>
                )}
              </div>
            }
          >
            <button
              type="button"
              aria-label="Show precise tagging details"
              className="self-center inline-flex items-center justify-center w-4 h-4 rounded-full text-faint hover:text-body-secondary hover:bg-surface-tertiary transition-colors cursor-help"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </Tooltip>
        </div>
      )}

      {/* FAILED block: error card (collapsible) + post-mortem metrics + retry */}
      {isFailed && (
        <>
          {entry.ErrorMessage && (
            <div
              className={`rounded-md border px-2.5 py-1.5 mt-0.5 ${
                staleness === 'stale'
                  ? 'bg-surface-hover border-border'
                  : staleness === 'aging'
                    ? 'bg-red-50/60 dark:bg-red-900/10 border-red-200/70 dark:border-red-800/40'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60'
              }`}
            >
              <p
                className={`text-[11px] leading-snug wrap-break-word ${
                  staleness === 'stale'
                    ? 'text-body-secondary'
                    : 'text-red-700 dark:text-red-300'
                } ${errorExpanded ? 'max-h-32 overflow-y-auto custom-scrollbar' : 'line-clamp-2'}`}
              >
                <span className="font-semibold">Error:</span> {entry.ErrorMessage}
              </p>
              {entry.ErrorMessage.length > 80 && (
                <button
                  type="button"
                  onClick={() => setErrorExpanded((v) => !v)}
                  className={`mt-1 text-[10px] font-semibold uppercase tracking-wide cursor-pointer hover:underline ${
                    staleness === 'stale' ? 'text-body-secondary' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {errorExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-[10px]">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-faint uppercase tracking-wide font-semibold">Processed</span>
              <span className="text-body-secondary font-medium tabular-nums">
                <span className="font-semibold text-heading">{entry.ProcessedTransactions.toLocaleString()}</span>
                <span className="text-faint"> / </span>
                {entry.TotalTransactions.toLocaleString()} txns
              </span>
            </span>
            <Separator />
            <MetaField label="Started" value={formatAbsoluteTime(entry.StartedAt, now)} />
            {entry.CompletedAt && (
              <>
                <Separator />
                <MetaField label="Failed" value={formatRelative(entry.CompletedAt, now)} />
              </>
            )}
            <Separator />
            <MetaField label="Duration" value={formatDuration(elapsedMs)} numeric />
            {onRetry && (
              <>
                <Separator />
                <button
                  type="button"
                  onClick={() => onRetry(entry)}
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                    staleness === 'stale'
                      ? 'text-body-secondary hover:text-heading hover:bg-surface-hover'
                      : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetaField({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-faint uppercase tracking-wide">{label}</span>
      <span className={`text-body-secondary font-medium ${numeric ? 'tabular-nums' : ''}`}>{value}</span>
    </span>
  );
}

function Separator() {
  return <span className="text-faint/60" aria-hidden>·</span>;
}

/** Unified status glyph so IN_PROGRESS / STALLED / FAILED all occupy a 12×12 slot. */
function StatusGlyph({ state }: { state: 'progress' | 'stalled' | 'failed' }) {
  if (state === 'progress') {
    return (
      <span className="relative inline-flex items-center justify-center w-3 h-3 shrink-0">
        <span className="motion-safe:animate-ping absolute inset-0 rounded-full bg-primary opacity-60" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  if (state === 'stalled') {
    return (
      <span className="inline-flex items-center justify-center w-3 h-3 shrink-0">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
      </span>
    );
  }
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.74 5a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" />
    </svg>
  );
}
