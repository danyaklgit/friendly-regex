import { useMemo, useState } from 'react';
import type { TagSpecDefinition, TagSpecLibrary } from '../../types';
import { getContextValue } from '../../types/tagSpec';
import { Modal } from '../shared/Modal';

interface LibraryTableModalProps {
  open: boolean;
  onClose: () => void;
  activeLib: TagSpecLibrary;
  inProgressLib: TagSpecLibrary;
  /** Used for the modal title so operators recognise which (bank, side)
   *  pair they're inspecting. */
  bank: string;
  side: string;
  bankLabel?: string;
}

type Scope = 'active' | 'inprogress' | 'both';

/**
 * Tabular drilldown for a single (bank, side) library, scoped to ACTIVE,
 * INPROGRESS, or both at once. Render is a flat HTML table — definition
 * counts per library are small enough that virtualization is wasted
 * machinery here.
 *
 * Columns are intentionally a superset of what fits in a single horizontal
 * scan: Tag, Side, TxType, Certainty, Status, Validity, Rules, Attributes.
 * Each section header carries the library's status + count so a Both view
 * stays scannable.
 */
export function LibraryTableModal({
  open,
  onClose,
  activeLib,
  inProgressLib,
  bank,
  side,
  bankLabel,
}: LibraryTableModalProps) {
  const [scope, setScope] = useState<Scope>('both');
  const display = bankLabel?.trim() ? `${bankLabel} (${bank})` : bank;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${display} · ${side} — Definitions`}
      widthClass="max-w-[1400px]"
      fullHeight
    >
      <div className="space-y-4">
        {/* Scope picker: ACTIVE / INPROGRESS / Both. Pill-style row so the
            currently-selected scope reads at a glance. */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-body-secondary mr-1">View:</span>
          <ScopePill value="active" label="ACTIVE" scope={scope} onChange={setScope} />
          <ScopePill value="inprogress" label="INPROGRESS" scope={scope} onChange={setScope} />
          <ScopePill value="both" label="Both" scope={scope} onChange={setScope} />
        </div>

        {(scope === 'active' || scope === 'both') && (
          <LibrarySection
            heading={`ACTIVE — ${activeLib.TagSpecDefinitions.length} definition${activeLib.TagSpecDefinitions.length === 1 ? '' : 's'}`}
            definitions={activeLib.TagSpecDefinitions}
          />
        )}

        {(scope === 'inprogress' || scope === 'both') && (
          <LibrarySection
            heading={`INPROGRESS — ${inProgressLib.TagSpecDefinitions.length} definition${inProgressLib.TagSpecDefinitions.length === 1 ? '' : 's'}`}
            definitions={inProgressLib.TagSpecDefinitions}
          />
        )}
      </div>
    </Modal>
  );
}

interface ScopePillProps {
  value: Scope;
  label: string;
  scope: Scope;
  onChange: (next: Scope) => void;
}

function ScopePill({ value, label, scope, onChange }: ScopePillProps) {
  const selected = scope === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      // Cursor + hover affordances: cursor-pointer on the whole pill, the
      // unselected state gets a tinted-primary hover so the operator
      // sees the click target light up before commit; the selected
      // state stays solid-primary but darkens slightly on hover so it
      // still reads as interactive (re-click is a no-op but the visual
      // feedback matters).
      className={`text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
        selected
          ? 'border-primary bg-primary text-white hover:bg-primary-dark hover:border-primary-dark'
          : 'border-border text-body-secondary hover:border-primary hover:bg-primary/10 hover:text-primary-dark'
      }`}
    >
      {label}
    </button>
  );
}

interface LibrarySectionProps {
  heading: string;
  definitions: TagSpecDefinition[];
}

function LibrarySection({ heading, definitions }: LibrarySectionProps) {
  // Same alphabetical sort the Backlog expanded card list now uses
  // (StatsTab.tsx around the expanded definitions render). Keeping
  // ordering consistent across surfaces means the operator's eye lands
  // on the same row in both places.
  const sorted = useMemo(() => {
    return [...definitions].sort((a, b) => {
      const tagCmp = (a.Tag ?? '').localeCompare(b.Tag ?? '', undefined, { sensitivity: 'base' });
      if (tagCmp !== 0) return tagCmp;
      return (a.Id ?? '').localeCompare(b.Id ?? '');
    });
  }, [definitions]);

  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-body-secondary">
        {heading}
      </div>
      {sorted.length === 0 ? (
        <div className="text-xs text-faint italic py-3 px-3 border border-border rounded-lg">
          No tag definitions in this library.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary text-body-secondary">
              <tr>
                <Th>Tag</Th>
                <Th>Side</Th>
                <Th>Tx Type</Th>
                <Th>Certainty</Th>
                <Th>Status</Th>
                <Th>Validity</Th>
                <Th align="right">Rule sets</Th>
                <Th align="right">Conditions</Th>
                <Th align="right">Attributes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((def) => (
                <DefinitionRow key={def.Id} def={def} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-body-secondary ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

// Per-value color tint for Certainty / Status cells. Subtle enough that
// long rows still scan as a whole table, distinct enough that a quick
// eye can pick out the LOW-certainty or non-ACTIVE rows.
const CERTAINTY_CLASS: Record<string, string> = {
  HIGH: 'text-emerald-600 dark:text-emerald-300',
  MEDIUM: 'text-amber-600 dark:text-amber-300',
  LOW: 'text-rose-600 dark:text-rose-300',
};
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'text-emerald-600 dark:text-emerald-300',
  INPROGRESS: 'text-amber-600 dark:text-amber-300',
  DRAFT: 'text-cyan-600 dark:text-cyan-300',
  INACTIVE: 'text-faint',
};

function DefinitionRow({ def }: { def: TagSpecDefinition }) {
  const ruleSets = def.TagRuleExpressions.length;
  const conditions = def.TagRuleExpressions.reduce((n, group) => n + group.length, 0);
  const sideRaw = getContextValue(def.Context, 'Side');
  const txTypeRaw = getContextValue(def.Context, 'TransactionTypeCode');
  const validity = formatValidity(def.Validity);
  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-3 py-2.5 font-semibold text-heading whitespace-nowrap">
        {def.Tag || <span className="text-faint italic font-normal">(unnamed)</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-body">
        {sideRaw || <span className="text-faint">—</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-body font-mono text-[11px]">
        {txTypeRaw || <span className="text-faint font-sans">—</span>}
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${CERTAINTY_CLASS[def.CertaintyLevelTag] ?? 'text-body'}`}>
        {def.CertaintyLevelTag}
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${STATUS_CLASS[def.StatusTag] ?? 'text-body'}`}>
        {def.StatusTag}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-body-secondary">{validity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-body">{ruleSets}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-body">{conditions}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-body">{def.Attributes.length}</td>
    </tr>
  );
}

/** Trim ISO datetime time portion so `2026-06-08T00:00:00Z` reads as
 *  `2026-06-08`. Mirrors the convention used by the Validity row in
 *  StepReview / the Backlog comparison modal. */
function trimDate(d: string | null): string | null {
  if (!d) return null;
  return d.includes('T') ? d.split('T')[0] : d;
}

function formatValidity(v: { StartDate: string | null; EndDate: string | null }): string {
  const start = trimDate(v.StartDate);
  const end = trimDate(v.EndDate);
  if (!start && !end) return 'Always';
  if (start && !end) return `From ${start}`;
  if (!start && end) return `Until ${end}`;
  return `${start} → ${end}`;
}
