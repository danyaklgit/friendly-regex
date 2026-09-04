import type { TransactionRow } from '../types';
import type { SuggestedTagSpec, SuggestionConfidence } from '../api/sampling';

/**
 * Curated View helpers (Smart Sampling Engine, 2026-09-03).
 *
 * Three row kinds share the curated grid and must read apart at a glance:
 * work rows that are untagged, work rows where several rules conflict, and
 * reference rows (already tagged, shown for comparison). The kind comes from
 * the row's own OPS fields — fixed by the backend design, never re-derived.
 */
export type CuratedRowKind = 'work-untagged' | 'work-conflict' | 'reference';

export function curatedRowKind(row: TransactionRow): CuratedRowKind {
  if (row['OpsIsUntagged'] === true) return 'work-untagged';
  if (row['OpsIsMultiTag'] === true) return 'work-conflict';
  return 'reference';
}

/** Operator-facing wording per confidence grade (hand-off doc §5).
 *  UNUSABLE suggestions are never shown — they carry no draft by design. */
export const CONFIDENCE_DISPLAY: Record<Exclude<SuggestionConfidence, 'UNUSABLE'>, string> = {
  HIGH: 'Draft ready',
  MED: 'Draft ready - check examples',
  LOW: 'Weak draft',
  REVIEW: 'Verify - likely a name',
};

/** Chip palette per confidence grade (light + dark). */
export function confidenceChipClass(confidence: SuggestionConfidence): string {
  switch (confidence) {
    case 'HIGH':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800';
    case 'MED':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800';
    case 'LOW':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800';
    case 'REVIEW':
      return 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800';
    default:
      return 'border-border bg-surface-secondary text-body-secondary';
  }
}

/**
 * Pending, showable suggestions keyed by SimilarSetId — the join key work
 * rows carry. UNUSABLE grades are excluded (no draft, never shown) and only
 * Pending docs remain actionable.
 */
export function suggestionsBySetId(
  suggestions: SuggestedTagSpec[] | null,
): Map<string, SuggestedTagSpec> {
  const map = new Map<string, SuggestedTagSpec>();
  for (const s of suggestions ?? []) {
    if (s.Status !== 'Pending' || s.Confidence === 'UNUSABLE') continue;
    if (s.SimilarSetId && !map.has(s.SimilarSetId)) map.set(s.SimilarSetId, s);
  }
  return map;
}

/** Header status-line numbers: pending suggestions + the backlog rows they cover. */
export function curatedPendingStats(
  suggestions: SuggestedTagSpec[] | null,
): { needRule: number; covering: number } | null {
  if (suggestions == null) return null;
  let needRule = 0;
  let covering = 0;
  for (const s of suggestions) {
    if (s.Status !== 'Pending' || s.Confidence === 'UNUSABLE') continue;
    needRule += 1;
    covering += s.CoverageCount > 0 ? s.CoverageCount : 0;
  }
  return { needRule, covering };
}

const ANCHOR_MAX_LEN = 70;

function truncateLabel(text: string): string {
  return text.length > ANCHOR_MAX_LEN ? `${text.slice(0, ANCHOR_MAX_LEN - 1).trimEnd()}\u2026` : text;
}

/**
 * Turn a StructuralAnchor (a regex-ish skeleton like
 * `^TRANSFER\ TO\ VENDORN\ SAUDI`) into a non-technical group label:
 * `Starts with "TRANSFER TO VENDORN SAUDI"`. Regex escapes are unwrapped,
 * numeric/whitespace classes become plain placeholders, and leftover regex
 * metacharacters are dropped. Falls back to the set's first example text.
 */
export function humanizeAnchor(
  anchor: string | null | undefined,
  fallbackExample?: string | null,
): string {
  const raw = (anchor ?? '').trim();
  if (!raw) {
    const ex = (fallbackExample ?? '').trim();
    return ex ? `Transactions like "${truncateLabel(ex)}"` : 'Similar transactions';
  }
  const anchored = raw.startsWith('^');
  let text = raw.replace(/^\^/, '').replace(/\$$/, '');
  text = text
    .replace(/\(\?i\)/g, '')
    .replace(/\\d\+?/g, '#')
    .replace(/\\s\+?/g, ' ')
    .replace(/\.\*|\.\+/g, '\u2026')
    // Unwrap remaining escapes (`\ ` -> space, `\/` -> /, `\.` -> .).
    .replace(/\\(.)/g, '$1')
    // Drop leftover regex structure characters that survived.
    .replace(/[()[\]{}?*+|]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!text) return humanizeAnchor(null, fallbackExample);
  return anchored ? `Starts with "${truncateLabel(text)}"` : `Contains "${truncateLabel(text)}"`;
}
