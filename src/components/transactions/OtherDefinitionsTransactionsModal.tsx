import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTransactions } from '../../api/transactions';
import { useTransactionData } from '../../hooks/useTransactionData';
import { translateFilters } from '../../utils/translateFilters';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { analyzeRow } from '../../utils/analyzeRow';
import { TagBadge } from './TagBadge';
import type { FilterProperty, TepHeaders } from '../../api/transactions';
import type { TransactionRow, TagSpecLibrary, AnalyzedTransaction } from '../../types';
import type { ColumnDef } from './TransactionTable';

interface OtherDefinitionsTransactionsModalProps {
  open: boolean;
  onClose: () => void;
  tagName: string;
  currentDefinitionId: string;
  /** Operator filter state (same shape as `filters` in TransactionsTab). The
   *  modal applies these so the listed rows match what the operator is
   *  currently looking at, minus the definition-ID scope. */
  filters: Record<string, Set<string>>;
  authToken: string;
  tepHeaders: TepHeaders;
  /** Visible columns from the main table — modal mirrors these (minus tags/attributes). */
  visibleColumns: ColumnDef[];
  /** Tag spec libraries for running tag analysis on the listed rows. */
  libraries: TagSpecLibrary[];
}

function formatAmount(value: unknown): { integer: string; decimal: string } | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return null;
  const parts = n.toFixed(2).split('.');
  return { integer: Number(parts[0]).toLocaleString(), decimal: parts[1] };
}

function AmountCell({ row, type }: { row: TransactionRow; type: 'debit' | 'credit' }) {
  const side = String(row['Side'] ?? '');
  const isDebit = type === 'debit' && (side === 'DR' || side === 'RC');
  const isCredit = type === 'credit' && (side === 'CR' || side === 'RD');
  const isReturn = side === 'RC' || side === 'RD';
  if (!isDebit && !isCredit) return <span className="text-faint">-</span>;
  const amt = formatAmount(row['Amount']);
  if (!amt) return <span className="text-faint">-</span>;
  return (
    <div className="flex items-center justify-end gap-1">
      {isReturn && <span className="text-[9px] font-semibold px-1 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">RTN</span>}
      <span>{isDebit && <span aria-hidden="true">&#x2212;</span>}<span className="icon-saudi_riyal">&#xea;</span> {amt.integer}<sup className="text-[0.65em] relative -top-[0.55em]">.{amt.decimal}</sup></span>
    </div>
  );
}

function getCellValue(row: TransactionRow, key: string): string {
  const val = row[key];
  if (val == null || val === '') return '';
  return String(val);
}

/** Returns true when the row is tagged by the definition the operator is
 *  currently editing — either as the primary tag (OpsTagSpecDefinitionId) or
 *  somewhere inside the OpsMultiTags array. We filter these out so only rows
 *  matched by *other* definitions sharing the same tag name remain. */
function isOwnDefinitionRow(row: TransactionRow, defId: string): boolean {
  if (String(row['OpsTagSpecDefinitionId'] ?? '') === defId) return true;
  const multi = row['OpsMultiTags'];
  if (Array.isArray(multi)) {
    for (const entry of multi) {
      const id = entry && typeof entry === 'object'
        ? (entry as Record<string, unknown>)['TagSpecDefinitionId']
        : null;
      if (id != null && String(id) === defId) return true;
    }
  }
  return false;
}

export function OtherDefinitionsTransactionsModal({
  open,
  onClose,
  tagName,
  currentDefinitionId,
  filters,
  authToken,
  tepHeaders,
  visibleColumns,
  libraries,
}: OtherDefinitionsTransactionsModalProps) {
  const { filterDefinitions } = useTransactionData();
  const [rows, setRows] = useState<AnalyzedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive context table columns from the main table's visible columns (skip tags; attributes go last)
  type ContextCol = Extract<ColumnDef, { type: 'data' | 'dates' | 'debit' | 'credit' }>;
  type AttrCol = Extract<ColumnDef, { type: 'attribute' }>;
  const contextColumns = useMemo(() => {
    const cols = visibleColumns.filter((col): col is ContextCol => col.type !== 'tags' && col.type !== 'attribute');
    const seqIdx = cols.findIndex((c) => c.type === 'data' && c.field === 'Sequence');
    if (seqIdx > 0) {
      const [seq] = cols.splice(seqIdx, 1);
      cols.unshift(seq);
    }
    return cols;
  }, [visibleColumns]);

  const attributeColumns = useMemo(() => {
    return visibleColumns.filter((col): col is AttrCol => col.type === 'attribute');
  }, [visibleColumns]);

  const getAttrValue = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const tagAttrs of Object.values(item.analysis.attributes)) {
      if (attrName in tagAttrs && tagAttrs[attrName] !== null) return tagAttrs[attrName];
    }
    return null;
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    // Page through ALL rows matching the tag name across the operator's
    // filters before client-side filtering out the operator's own definition.
    // A single 500-row page is not enough when the operator's definition owns
    // most of the matches (e.g. 1,248 of 1,304 → only ~32 "other" rows fit in
    // page 1, the remaining ~24 sit on pages 2–3). PAGE_LIMIT caps a runaway.
    const PAGE_SIZE = 500;
    const PAGE_LIMIT = 40; // up to 20k tag-name matches; safe ceiling
    try {
      const tagNameFilter: FilterProperty = {
        ColumnName: 'OpsTag|OpsMultiTags.Tag',
        Value: tagName,
        Operand: 'IN',
      };
      const baseFilters = translateFilters(filters, filterDefinitions);
      const allRows: TransactionRow[] = [];
      let total: number | null = null;
      for (let pageIndex = 0; pageIndex < PAGE_LIMIT; pageIndex++) {
        const result = await getTransactions(
          {
            FilteringProperties: [...baseFilters, tagNameFilter],
            SortingProperties: [{ ColumnName: 'StatementDate', SortingLevel: 1, SortingOrder: 'ASC' }],
            Pagination: { PageIndex: pageIndex, PageSize: PAGE_SIZE },
          },
          authToken,
          tepHeaders,
        );
        if (total === null) total = result.TransactionsCount ?? 0;
        const page = result.Transactions ?? [];
        allRows.push(...page);
        if (page.length < PAGE_SIZE) break;
        if (total != null && allRows.length >= total) break;
      }
      // Filter out rows tagged by the operator's current definition; what
      // remains are rows tagged by some OTHER definition that happens to share
      // the same name. Tag analysis runs in `backendAuthoritative` mode so the
      // OpsTag/OpsMultiTags from the API drive the badges (don't re-run rules).
      const others = allRows.filter((row) => !isOwnDefinitionRow(row, currentDefinitionId));
      const analyzed = others.map((row) => ({
        row,
        analysis: analyzeRow(row, libraries, true),
      }));
      setRows(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions.');
    } finally {
      setLoading(false);
    }
  }, [tagName, currentDefinitionId, filters, filterDefinitions, authToken, tepHeaders, libraries]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-elevated shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-heading">
            Other transactions tagged "{tagName}"
          </h2>
          <div className="flex items-center gap-2 text-sm text-body-secondary mt-0.5">
            <span>Tagged by a different definition than the one you're editing</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-faint hover:text-body-secondary transition-colors p-1.5 cursor-pointer"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {loading && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                {contextColumns.flatMap((col, colIdx) => {
                  const th = (key: string) => (
                    <th key={key} className="px-3 py-2.5 bg-surface-secondary sticky top-0 z-1">
                      <div className="h-2.5 w-18 rounded bg-surface-hover animate-pulse" />
                    </th>
                  );
                  if (colIdx === 0) return [th(col.key), th('__ctx_tags')];
                  return [th(col.key)];
                })}
                {attributeColumns.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 bg-white dark:bg-slate-800 sticky top-0 z-1">
                    <div className="h-2.5 w-18 rounded bg-primary/15 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 25 }, (_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {contextColumns.flatMap((col, colIdx) => {
                    const widths = ['w-8', 'w-20', 'w-24', 'w-16', 'w-14', 'w-28', 'w-32', 'w-20'];
                    const w = widths[(colIdx) % widths.length];
                    const td = (key: string, width: string) => (
                      <td key={key} className="px-3 py-2.5">
                        <div className={`h-3 ${width} rounded bg-surface-hover animate-pulse`} style={{ animationDelay: `${(i * 50) + (colIdx * 30)}ms` }} />
                      </td>
                    );
                    if (colIdx === 0) return [td(col.key, w), td('__ctx_tags', 'w-16')];
                    return [td(col.key, w)];
                  })}
                  {attributeColumns.map((col, ai) => (
                    <td key={col.key} className="px-3 py-2.5 bg-primary/5">
                      <div className="h-3 w-20 rounded bg-primary/15 animate-pulse" style={{ animationDelay: `${(i * 50) + ((contextColumns.length + ai) * 30)}ms` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-faint">No other transactions share this tag.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                {contextColumns.flatMap((col, colIdx) => {
                  const th = (key: string, label: string) => (
                    <th key={key} className="px-3 py-2 text-left text-xs font-medium text-body-secondary whitespace-nowrap bg-surface-secondary sticky top-0 z-1">
                      {label}
                    </th>
                  );
                  const header = th(
                    col.key,
                    col.type === 'data' ? humanizeFieldName(col.field)
                      : col.type === 'dates' ? 'Dates'
                      : col.type === 'debit' ? 'Debit Amount'
                      : 'Credit Amount',
                  );
                  if (colIdx === 0) return [header, th('__ctx_tags', 'Tags')];
                  return [header];
                })}
                {attributeColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-primary-dark bg-white dark:bg-slate-800 sticky top-0 z-1"
                  >
                    {humanizeFieldName(col.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => (
                <tr key={i} className="border-b border-border/50 transition-colors hover:bg-surface-hover">
                  {contextColumns.flatMap((col, colIdx) => {
                    const cellCls = 'px-3 py-1.5 whitespace-nowrap';
                    const tagCell = colIdx === 0 ? (
                      <td key="__ctx_tags" className={`${cellCls}`}>
                        <div className="flex gap-1 flex-wrap">
                          {item.analysis.tags.length > 0 ? item.analysis.tags.map((tag) => (
                            <TagBadge key={tag} tag={tag} />
                          )) : <span className="text-faint text-xs">-</span>}
                        </div>
                      </td>
                    ) : null;

                    let dataCell: React.ReactNode;
                    switch (col.type) {
                      case 'debit':
                        dataCell = (
                          <td key={col.key} className={`${cellCls} text-right text-red-600 dark:text-rose-300 font-medium`}>
                            <AmountCell row={item.row} type="debit" />
                          </td>
                        );
                        break;
                      case 'credit':
                        dataCell = (
                          <td key={col.key} className={`${cellCls} text-right text-emerald-500 dark:text-emerald-300 font-medium`}>
                            <AmountCell row={item.row} type="credit" />
                          </td>
                        );
                        break;
                      case 'dates':
                        dataCell = (
                          <td key={col.key} className={`${cellCls} text-body-secondary`}>
                            <div className="flex gap-2">
                              {col.fields.map((f) => {
                                const val = item.row[f.key];
                                return val ? (
                                  <span key={f.key} className="text-xs">
                                    <span className="text-faint mr-0.5">{f.label}:</span>{String(val).split('T')[0]}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </td>
                        );
                        break;
                      case 'data':
                        dataCell = (
                          <td key={col.key} className={`${cellCls} text-body-secondary`}>
                            {getCellValue(item.row, col.field)}
                          </td>
                        );
                        break;
                    }
                    return tagCell ? [dataCell, tagCell] : [dataCell];
                  })}
                  {attributeColumns.map((col) => {
                    const hasTags = item.analysis.tags.length > 0;
                    const val = hasTags ? getAttrValue(item, col.name) : null;
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-1.5 text-xs whitespace-nowrap bg-primary/5 ${hasTags && val ? 'text-primary-dark' : ''}`}
                      >
                        {hasTags && val ? val : <span className="text-faint">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && rows.length > 0 && (
        <div className="px-6 py-2 text-xs text-faint border-t border-border bg-surface-elevated shrink-0">
          {rows.length} transaction{rows.length !== 1 ? 's' : ''} tagged by a different definition
        </div>
      )}
    </div>
  );
}
