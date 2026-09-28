import type { TaggingGranularity } from '../../api/taggingReportsShared';
import { GRANULARITY_LABELS } from './labels';

/** Full digits with en-US separators: operators want exact numbers, not 12.9K. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Tiles use 1 decimal, tables the backend's 2. */
export function formatRate(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/**
 * "as of" time for ComputedAtUtc. Unlike period strings this IS a real UTC
 * instant, so new Date(iso) is correct here. `timeZone` is for tests; the
 * page leaves it undefined to get the browser's local zone.
 */
export function formatAsOf(iso: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
}

export function formatAsOfFull(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = d.toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 19)} UTC`;
}

/** "Business periods 2022-07-18 to 2026-09-27 · by month · Operator view". */
export function formatRangeCaption(prefix: string, from: string, to: string, granularity: TaggingGranularity, layerLabel?: string): string {
  const range = from && to ? `${from} to ${to}` : from ? `from ${from}` : to ? `to ${to}` : 'all history';
  const parts = [`${prefix} ${range}`, `by ${GRANULARITY_LABELS[granularity].toLowerCase()}`];
  if (layerLabel) parts.push(layerLabel);
  return parts.join(' · ');
}
