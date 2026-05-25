import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getTransactions } from '../../api/transactions';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { analyzeRow } from '../../utils/analyzeRow';
import { TagBadge } from './TagBadge';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { Toast } from '../shared/Toast';
import type { FilterProperty, TepHeaders } from '../../api/transactions';
import type { TransactionRow, TagSpecLibrary, AnalyzedTransaction } from '../../types';
import type { ColumnDef } from './TransactionTable';

interface ViewContextModalProps {
  open: boolean;
  onClose: () => void;
  transaction: TransactionRow;
  authToken: string;
  tepHeaders: TepHeaders;
  /** Visible columns from the main table — modal mirrors these (minus tags/attributes). */
  visibleColumns: ColumnDef[];
  /** Tag spec libraries for running tag analysis on context rows. */
  libraries: TagSpecLibrary[];
}

function formatAmount(value: unknown): { integer: string; decimal: string } | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return null;
  const parts = n.toFixed(2).split('.');
  return { integer: Number(parts[0]).toLocaleString(), decimal: parts[1] };
}

function isClickedRow(row: TransactionRow, clicked: TransactionRow): boolean {
  return (
    String(row['Sequence'] ?? '') === String(clicked['Sequence'] ?? '') &&
    String(row['BankReference'] ?? '') === String(clicked['BankReference'] ?? '') &&
    String(row['Amount'] ?? '') === String(clicked['Amount'] ?? '')
  );
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

export function ViewContextModal({ open, onClose, transaction, authToken, tepHeaders, visibleColumns, libraries }: ViewContextModalProps) {
  const { filterDefinitions } = useTransactionData();
  const [rows, setRows] = useState<AnalyzedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Export to Download Center — uses the same bank+statementDate+IBAN scope
  // the modal already fetches with, so the resulting export contains exactly
  // the rows the operator is looking at. Optional context so the editor still
  // renders if the provider isn't mounted in a particular surface.
  const downloadCenter = useOptionalDownloadCenter();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // Derive context table columns from the main table's visible columns (skip tags; attributes go last)
  type ContextCol = Extract<ColumnDef, { type: 'data' | 'dates' | 'debit' | 'credit' }>;
  type AttrCol = Extract<ColumnDef, { type: 'attribute' }>;
  const contextColumns = useMemo(() => {
    const cols = visibleColumns.filter((col): col is ContextCol => col.type !== 'tags' && col.type !== 'attribute');
    // Sequence always first, then the rest in their original order
    const seqIdx = cols.findIndex((c) => c.type === 'data' && c.field === 'Sequence');
    if (seqIdx > 0) {
      const [seq] = cols.splice(seqIdx, 1);
      cols.unshift(seq);
    }
    // Debit and Credit must always appear in the context modal — operators
    // scan the surrounding statement and need both money columns regardless
    // of which ones they toggled visible in the main table. Keep them
    // adjacent: when only ONE is visible, drop the missing one next to it
    // so they read like a single Debit | Credit pair (matches the main
    // table layout). When BOTH are missing, anchor on Sequence (or fall
    // back to the start) so they appear together near the row's head.
    const debitIdx = cols.findIndex((c) => c.type === 'debit');
    const creditIdx = cols.findIndex((c) => c.type === 'credit');
    if (debitIdx === -1 && creditIdx !== -1) {
      cols.splice(creditIdx, 0, { type: 'debit', key: '__debit' });
    } else if (creditIdx === -1 && debitIdx !== -1) {
      cols.splice(debitIdx + 1, 0, { type: 'credit', key: '__credit' });
    } else if (debitIdx === -1 && creditIdx === -1) {
      const anchorIdx = cols.findIndex((c) => c.type === 'data' && c.field === 'Sequence');
      const insertAt = anchorIdx >= 0 ? anchorIdx + 1 : 0;
      cols.splice(insertAt, 0,
        { type: 'debit', key: '__debit' },
        { type: 'credit', key: '__credit' },
      );
    }
    return cols;
  }, [visibleColumns]);

  // Attribute columns — appended at the end, color-coded like the main table
  const attributeColumns = useMemo(() => {
    return visibleColumns.filter((col): col is AttrCol => col.type === 'attribute');
  }, [visibleColumns]);

  // Helper: find attribute value across tag→attrs map
  const getAttrValue = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const tagAttrs of Object.values(item.analysis.attributes)) {
      if (attrName in tagAttrs && tagAttrs[attrName] !== null) return tagAttrs[attrName];
    }
    return null;
  };

  const bankName = useMemo(() => {
    const code = String(transaction['BankSwiftCode'] ?? '');
    const bankDef = filterDefinitions.find((d) => d.Values.some((v) => v.Column === 'BankSwiftCode'));
    const match = bankDef?.Values.find((v) => v.Value === code);
    return match?.Label ?? code;
  }, [transaction, filterDefinitions]);

  const fetchContext = useCallback(async () => {
    const bank = String(transaction['BankSwiftCode'] ?? '');
    const iban = String(transaction['IBAN'] ?? '');
    const stmtDate = String(transaction['StatementDate'] ?? '');

    if (!bank || !stmtDate) {
      setError('Missing bank or statement date on this transaction.');
      return;
    }

    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const filters = [
        { ColumnName: 'BankSwiftCode', Value: bank, Operand: 'EQ' },
        { ColumnName: 'StatementDate', Value: stmtDate, Operand: 'EQ' },
      ];
      if (iban) {
        filters.push({ ColumnName: 'IBAN', Value: iban, Operand: 'EQ' });
      }
      const result = await getTransactions(
        {
          FilteringProperties: filters,
          SortingProperties: [{ ColumnName: 'Sequence', SortingLevel: 1, SortingOrder: 'ASC' }],
          Pagination: { PageIndex: 0, PageSize: 500 },
        },
        authToken,
        tepHeaders,
      );
      // This modal always fetches live data via the API, so backend tags
      // (OpsTag / OpsMultiTags) are authoritative — don't re-run rules locally.
      const analyzed = (result.Transactions ?? []).map((row) => ({
        row,
        analysis: analyzeRow(row, libraries, true),
      }));
      setRows(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch context transactions.');
    } finally {
      setLoading(false);
    }
  }, [transaction, authToken, tepHeaders, libraries]);

  // Anchor the refetch on the modal-open transition AND the transaction
  // identity (bank + statement date + IBAN) — NOT on the `fetchContext`
  // callback reference. Otherwise an unrelated re-render that gives
  // `tepHeaders` / `authToken` / `libraries` a new reference (e.g. the
  // Download Center context updating after Export) re-runs the network
  // call we just finished. The eslint-disable below is intentional for
  // the same reason.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    void fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    String(transaction['BankSwiftCode'] ?? ''),
    String(transaction['StatementDate'] ?? ''),
    String(transaction['IBAN'] ?? ''),
  ]);

  // Reset transient export feedback whenever the modal is reopened on a
  // different transaction.
  useEffect(() => {
    if (!open) return;
    setExportStatus(null);
    setExporting(false);
  }, [open, transaction]);

  const handleExport = useCallback(async () => {
    if (!downloadCenter) return;
    const bank = String(transaction['BankSwiftCode'] ?? '');
    const ibanVal = String(transaction['IBAN'] ?? '');
    const stmtDateVal = String(transaction['StatementDate'] ?? '');
    if (!bank || !stmtDateVal) {
      setExportStatus({ kind: 'error', message: 'Missing bank or statement date on this transaction.' });
      return;
    }
    const filters: FilterProperty[] = [
      { ColumnName: 'BankSwiftCode', Value: bank, Operand: 'EQ' },
      { ColumnName: 'StatementDate', Value: stmtDateVal, Operand: 'EQ' },
    ];
    if (ibanVal) filters.push({ ColumnName: 'IBAN', Value: ibanVal, Operand: 'EQ' });

    setExporting(true);
    setExportStatus(null);
    try {
      await downloadCenter.triggerExport(
        filters,
        [{ ColumnName: 'Sequence', SortingLevel: 1, SortingOrder: 'ASC' }],
      );
      setExportStatus({
        kind: 'success',
        message: 'Export queued — check the Download Center when ready.',
      });
    } catch (e) {
      setExportStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to queue export.',
      });
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  }, [downloadCenter, transaction]);

  // Auto-scroll to the highlighted row after data loads
  useEffect(() => {
    if (!loading && rows.length > 0 && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, rows]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const iban = String(transaction['IBAN'] ?? '');
  const stmtDateRaw = String(transaction['StatementDate'] ?? '');
  const stmtDate = stmtDateRaw.split('T')[0];

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-elevated shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-heading">Statement Context</h2>
          <div className="flex items-center gap-2 text-sm text-body-secondary mt-0.5">
            <span className="font-medium text-heading">{bankName}</span>
            <span className="text-faint">/</span>
            <span>{stmtDate}</span>
            <span className="text-faint">/</span>
            <span className="font-mono text-xs">{iban}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {downloadCenter && (
            <Tooltip content="Queue an export of this statement's transactions" placement="bottom">
              <Button
                variant="secondary"
                size="xs"
                onClick={handleExport}
                disabled={exporting || loading || rows.length === 0}
                className="whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {exporting ? 'Queueing…' : 'Export'}
              </Button>
            </Tooltip>
          )}
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
            <p className="text-sm text-faint">No transactions found for this statement.</p>
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
                  // Insert Tags header after the first column (Sequence)
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
              {rows.map((item, i) => {
                const isHighlighted = isClickedRow(item.row, transaction);
                return (
                  <tr
                    key={i}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={`border-b border-border/50 transition-colors ${
                      isHighlighted
                        ? 'bg-primary/10 dark:bg-primary/15 border-l-3 border-l-primary'
                        : 'hover:bg-surface-hover'
                    }`}
                  >
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
                            <td key={col.key} className={`${cellCls} text-right text-red-600 dark:text-rose-300 font-medium ${isHighlighted ? 'font-semibold' : ''}`}>
                              <AmountCell row={item.row} type="debit" />
                            </td>
                          );
                          break;
                        case 'credit':
                          dataCell = (
                            <td key={col.key} className={`${cellCls} text-right text-emerald-500 dark:text-emerald-300 font-medium ${isHighlighted ? 'font-semibold' : ''}`}>
                              <AmountCell row={item.row} type="credit" />
                            </td>
                          );
                          break;
                        case 'dates':
                          dataCell = (
                            <td key={col.key} className={`${cellCls} text-body-secondary ${isHighlighted ? 'font-medium' : ''}`}>
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
                            <td key={col.key} className={`${cellCls} text-body-secondary ${isHighlighted ? 'font-medium' : ''}`}>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && rows.length > 0 && (
        <div className="px-6 py-2 text-xs text-faint border-t border-border bg-surface-elevated shrink-0">
          {rows.length} transaction{rows.length !== 1 ? 's' : ''} in this statement
        </div>
      )}
      {/* Toast for Export feedback. Rendered with a z-index above the modal
          (z-[10000]) so the success/error message floats over the table.
          Matches the toast pattern used elsewhere in the app. */}
      {exportStatus && (
        <Toast
          message={exportStatus.message}
          type={exportStatus.kind}
          duration={3000}
          zClass="z-[10001]"
          onClose={() => setExportStatus(null)}
        />
      )}
    </div>
  );
}
