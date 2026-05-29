import { useMemo, useState, useCallback } from 'react';
import type { TransactionRow } from '../../types';
import type { CertaintyLevelTag } from '../../types/tagSpec';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useUserMode } from '../../context/UserModeContext';
import { groupsForTag } from '../../utils/userMode/groupsForTag';
import { randomJv } from '../../utils/userMode/randomJv';
import { AttributesCell } from './AttributesCell';
import { DescriptionCell } from './DescriptionCell';
import { TagPickerModal } from './TagPickerModal';
import { ContributionDialog, type ContributionDraft } from './ContributionDialog';

interface UserTransactionTableProps {
  rows: TransactionRow[];
  loading: boolean;
}

/**
 * Fixed-column transactions table for user-mode. Every cell here renders from
 * the row + analyzed tags + the per-user contribution overlay. No column
 * picker, no comments, no row context menu, no hide affordance — those all
 * live in the operator-mode TransactionTable.
 *
 * Color coding follows the legend rendered next to the redaction toggle:
 *   - Tag / Group(s):   blue when backend-enhanced, orange when the user has
 *                       overridden the tag for this row
 *   - Attributes:       always blue (extracted from the backend tag definition,
 *                       unaffected by a tag re-label)
 *   - Other columns:    gray (raw bank data; debit/credit keep their
 *                       semantic red/emerald accent)
 *
 * Per-row randomness for the Reconciled / JV columns is stable for the row's
 * mount lifetime; it intentionally re-rolls on remount (pagination, company
 * switch) to make clear these are demo-only values.
 *
 * Layout: the table lives inside a flex parent that owns the height budget.
 * Here we render a vertically-scrolling container with a sticky `<thead>` so
 * the column labels stay pinned while the body scrolls. The pagination strip
 * sits outside this component so it can be sticky at the page bottom too.
 */
export function UserTransactionTable({ rows, loading }: UserTransactionTableProps) {
  const { tagsHierarchy } = useTagSpecs();
  const { fieldMeta, filterDefinitions } = useTransactionData();
  const { contributions, addContribution } = useUserMode();

  // Code → friendly label lookup for the Transaction Type cell. We grab the
  // TransactionTypeCode filter definition and project its Values into a Map.
  // Falls back to `null` for unknown codes — the cell then shows the code on
  // its own without a second line.
  const txnTypeLabelByCode = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    const def = filterDefinitions.find(
      (d) => d.Tag === 'TransactionTypeCode' || d.Label?.toLowerCase().includes('transaction type'),
    );
    if (!def) return map;
    for (const v of def.Values) {
      const code = v.Value ?? '';
      if (!code) continue;
      // SubLabel is sometimes used for the longer description; Label is the
      // canonical friendly name. Pick the first non-empty.
      const friendly = (v.Label && v.Label !== code ? v.Label : null) ?? v.SubLabel ?? '';
      if (friendly) map.set(code, friendly);
    }
    return map;
  }, [filterDefinitions]);

  // Picker / dialog session state — only one row's flow is active at a time.
  // `original` captures the row's true backend tag (used to record the
  // contribution's "From" so a future Revert restores the backend value).
  // `seed` is what the picker should pre-select — the tag the user actually
  // sees on the pill right now, which is the contribution's newTag when the
  // user has already edited this row, otherwise the backend tag.
  const [pickerRow, setPickerRow] = useState<TransactionRow | null>(null);
  const [pickerOriginal, setPickerOriginal] = useState<{ tag: string | null; groups: string[] }>({ tag: null, groups: [] });
  const [pickerSeed, setPickerSeed] = useState<string | null>(null);
  const [dialogDraft, setDialogDraft] = useState<ContributionDraft | null>(null);

  const contributionByTxId = useMemo(() => {
    const map = new Map<string, (typeof contributions)[number]>();
    for (const c of contributions) map.set(c.transactionId, c);
    return map;
  }, [contributions]);

  const getTxId = useCallback(
    (row: TransactionRow): string => String(row[fieldMeta.identifierField] ?? row['Id'] ?? ''),
    [fieldMeta.identifierField],
  );

  const handleTagClick = useCallback(
    (row: TransactionRow, originalTag: string | null, displayedTag: string | null) => {
      setPickerRow(row);
      setPickerOriginal({
        tag: originalTag,
        groups: originalTag ? groupsForTag(tagsHierarchy, originalTag) : [],
      });
      setPickerSeed(displayedTag);
    },
    [tagsHierarchy],
  );

  const handlePickerSelect = useCallback(
    (newTag: string, isCustom: boolean) => {
      if (!pickerRow) return;
      const txId = getTxId(pickerRow);
      if (!txId) {
        // Defensive: contributions are keyed by the row's identifier. If it's
        // missing we'd write to "" and collapse multiple rows' edits together.
        setPickerRow(null);
        return;
      }
      setDialogDraft({
        transactionId: txId,
        bankReference: String(pickerRow['BankReference'] ?? ''),
        entryDate: String(pickerRow['StatementDate'] ?? ''),
        originalTag: pickerOriginal.tag,
        originalGroups: pickerOriginal.groups,
        newTag,
        newGroups: groupsForTag(tagsHierarchy, newTag),
        newTagIsCustom: isCustom,
      });
      setPickerRow(null);
    },
    [pickerRow, pickerOriginal, getTxId, tagsHierarchy],
  );

  const handleDialogSubmit = useCallback(
    (saveType: 'self' | 'review', reason?: string) => {
      if (!dialogDraft) return;
      addContribution({
        ...dialogDraft,
        saveType,
        reason: saveType === 'review' ? reason : undefined,
        contributionDate: new Date().toISOString(),
      });
      setDialogDraft(null);
    },
    [dialogDraft, addContribution],
  );

  return (
    <>
      <div className="h-full overflow-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm text-body">
          <thead className="sticky top-0 z-10 bg-surface-secondary text-xs uppercase tracking-wide text-muted shadow-[0_1px_0_0_var(--color-border)]">
            <tr>
              <Th>Tag</Th>
              <Th>Group(s)</Th>
              <Th>Account Number</Th>
              <Th>Date</Th>
              <Th>Bank Reference</Th>
              <Th className="text-right">Debit</Th>
              <Th className="text-right">Credit</Th>
              <Th className="min-w-[260px]">Description</Th>
              <Th>Transaction Type</Th>
              <Th className="min-w-[220px]">Attributes</Th>
              <Th className="text-center">Reconciled</Th>
              <Th className="text-center">JV/Document Number</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-sm text-body-secondary">
                  No transactions for this company yet.
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-sm text-body-secondary">
                  Loading transactions…
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <Row
                key={`${getTxId(row) || idx}`}
                row={row}
                tagsHierarchy={tagsHierarchy}
                txnTypeLabelByCode={txnTypeLabelByCode}
                contribution={contributionByTxId.get(getTxId(row))}
                onTagClick={handleTagClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {pickerRow && (
        <TagPickerModal
          open={true}
          originalTag={pickerSeed}
          onClose={() => setPickerRow(null)}
          onSelect={handlePickerSelect}
        />
      )}

      {dialogDraft && (
        <ContributionDialog
          open={true}
          draft={dialogDraft}
          onClose={() => setDialogDraft(null)}
          onSubmit={handleDialogSubmit}
        />
      )}
    </>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  // `whitespace-nowrap` keeps every header label on a single line so the
  // sticky thead is a clean one-row strip even when individual columns are
  // narrow (e.g. "Bank Reference", "JV/Document Number").
  return <th className={`px-3 py-2 text-left font-medium whitespace-nowrap ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

interface RowProps {
  row: TransactionRow;
  tagsHierarchy: ReturnType<typeof useTagSpecs>['tagsHierarchy'];
  txnTypeLabelByCode: Map<string, string>;
  contribution: ReturnType<typeof useUserMode>['contributions'][number] | undefined;
  onTagClick: (row: TransactionRow, originalTag: string | null, displayedTag: string | null) => void;
}

const CERTAINTY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/** Read the backend-assigned tag + its extracted attributes straight off the
 *  row. Skips the libraries-based lookup that the operator portal uses, which
 *  means the user view works even when the backend rejects `/GetTagSpecLibraries`
 *  for the demo `user` role. */
function readBackendTag(row: TransactionRow): { tag: string | null; attributes: Record<string, string> } {
  const r = row as unknown as Record<string, unknown>;

  // Multi-tag rows: pick the highest-certainty entry, then read its
  // Attributes. Single-tag rows: read `OpsTag` + `OpsAttributes` directly.
  const multi = r.OpsMultiTags;
  if (Array.isArray(multi) && multi.length > 0) {
    let best: { Tag?: string; CertaintyLevel?: CertaintyLevelTag; Attributes?: unknown } | null = null;
    let bestRank = -1;
    for (const mt of multi) {
      if (!mt || typeof mt !== 'object') continue;
      const m = mt as { Tag?: unknown; CertaintyLevel?: unknown; Attributes?: unknown };
      const rank = typeof m.CertaintyLevel === 'string' ? (CERTAINTY_RANK[m.CertaintyLevel] ?? 0) : 0;
      if (rank > bestRank) {
        best = m as { Tag?: string; CertaintyLevel?: CertaintyLevelTag; Attributes?: unknown };
        bestRank = rank;
      }
    }
    if (best?.Tag) {
      return { tag: best.Tag, attributes: scanAttrs(best.Attributes) };
    }
  }

  const opsTag = typeof r.OpsTag === 'string' ? r.OpsTag : null;
  if (opsTag) {
    return { tag: opsTag, attributes: scanAttrs(r.OpsAttributes) };
  }

  return { tag: null, attributes: {} };
}

/** Server attribute lists arrive as `[{Key, Value}, ...]`. Flatten into a
 *  display-friendly map, dropping nulls/empties so the cell doesn't render
 *  ghost rows. */
function scanAttrs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const e = entry as { Key?: unknown; Value?: unknown };
      if (typeof e.Key === 'string' && e.Value != null && e.Value !== '') {
        out[e.Key] = String(e.Value);
      }
    }
  }
  return out;
}

// Pill style helpers for the Tag column (clickable) and Group column (display-only).
// `edited` flips the pill to the orange "user-customized" treatment from the legend.
function tagPillClass(edited: boolean): string {
  return edited
    ? 'border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-300/60 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-200/70 dark:hover:bg-orange-900/50'
    : 'border-primary/30 bg-primary/10 text-primary-dark dark:text-primary-light hover:bg-primary/20';
}
function groupPillClass(edited: boolean): string {
  // Non-clickable variant: drop the hover state so the user doesn't think
  // they're a button.
  return edited
    ? 'border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-300/60 dark:bg-orange-900/30 dark:text-orange-300'
    : 'border-primary/30 bg-primary/10 text-primary-dark dark:text-primary-light';
}

function Row({ row, tagsHierarchy, txnTypeLabelByCode, contribution, onTagClick }: RowProps) {
  // Demo-only random fields; stable for the row's mount lifetime, fresh on remount.
  // Spec choice: "truly random" — no seeding by id, just `Math.random()` once.
  const { reconciled, jv } = useMemo(
    () => ({ reconciled: Math.random() < 0.5, jv: randomJv() }),
    [],
  );

  const { tag: backendTag, attributes: backendAttributes } = useMemo(() => readBackendTag(row), [row]);

  const originalTag = backendTag;
  const displayedTag = contribution?.newTag ?? originalTag;
  const displayedGroups = useMemo(
    () => (displayedTag ? groupsForTag(tagsHierarchy, displayedTag) : []),
    [displayedTag, tagsHierarchy],
  );

  // Attributes always come from the row's backend-tagged value. A user
  // contribution only changes the displayed tag NAME — it doesn't re-extract
  // attributes, so the original tag's extracted values still apply.
  const attributesMap = backendAttributes;

  const side = String(row['Side'] ?? '');
  const isDebit = side === 'DR' || side === 'RC';
  const isCredit = side === 'CR' || side === 'CT';
  const amount = row['Amount'] != null ? formatAmount(row['Amount']) : '';
  const debitAmount = isDebit ? amount : '';
  const creditAmount = isCredit ? amount : '';

  const edited = !!contribution;

  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <Td>
        <button
          type="button"
          onClick={() => onTagClick(row, originalTag, displayedTag)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border transition-colors ${
            displayedTag
              ? tagPillClass(edited)
              : 'border-border-strong text-body-secondary hover:bg-surface-hover'
          }`}
          title={
            edited
              ? 'You changed this tag — click to change again'
              : displayedTag
                ? 'Click to change tag'
                : 'Click to add tag'
          }
        >
          {displayedTag ?? '— add tag —'}
        </button>
      </Td>
      <Td>
        {displayedGroups.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {displayedGroups.map((g) => (
              <span
                key={g}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${groupPillClass(edited)}`}
              >
                <TagGroupIcon />
                {g}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-faint text-xs">—</span>
        )}
      </Td>
      <Td className="font-mono text-xs">{String(row['IBAN'] ?? '')}</Td>
      <Td className="whitespace-nowrap text-xs">{formatDate(row['StatementDate'])}</Td>
      <Td className="font-mono text-xs">{String(row['BankReference'] ?? '')}</Td>
      <Td className="text-right font-mono text-xs text-red-600 dark:text-rose-300 whitespace-nowrap">{debitAmount}</Td>
      <Td className="text-right font-mono text-xs text-emerald-600 dark:text-emerald-300 whitespace-nowrap">{creditAmount}</Td>
      <Td>
        <DescriptionCell text={String(row['AdditionalInformation'] ?? '')} />
      </Td>
      <Td className="text-xs text-center whitespace-nowrap">
        {(() => {
          const code = String(row['TransactionTypeCode'] ?? '');
          if (!code) return <span className="text-faint">—</span>;
          const friendly = txnTypeLabelByCode.get(code);
          return (
            <div className="flex flex-col items-center leading-tight">
              <span className="font-semibold text-heading">{code}</span>
              {friendly && (
                <span className="text-[11px] text-muted whitespace-normal">{friendly}</span>
              )}
            </div>
          );
        })()}
      </Td>
      <Td>
        <AttributesCell attributes={attributesMap} />
      </Td>
      <Td className="text-center">
        {reconciled ? (
          <span className="text-emerald-600 dark:text-emerald-300" aria-label="Reconciled">✓</span>
        ) : (
          <span className="text-red-500 dark:text-rose-300" aria-label="Not reconciled">✗</span>
        )}
      </Td>
      <Td className="text-center font-mono text-xs text-body-secondary">{reconciled ? jv : ''}</Td>
    </tr>
  );
}

function TagGroupIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-3 h-3 shrink-0"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z"
      />
    </svg>
  );
}

function formatAmount(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw ?? '');
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(raw: unknown): string {
  if (raw == null) return '';
  const iso = String(raw).split('T')[0];
  // ISO arrives as YYYY-MM-DD — reformat to DD/MM/YYYY for the user view.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
