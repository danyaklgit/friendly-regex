import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getTransactions } from '../../api/transactions';
import { useTransactionData } from '../../hooks/useTransactionData';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { analyzeRow } from '../../utils/analyzeRow';
import { TagBadge } from './TagBadge';
import type { TepHeaders } from '../../api/transactions';
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
      const analyzed = (result.Transactions ?? []).map((row) => ({
        row,
        analysis: analyzeRow(row, libraries),
      }));
      setRows(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch context transactions.');
    } finally {
      setLoading(false);
    }
  }, [transaction, authToken, tepHeaders, libraries]);

  useEffect(() => {
    if (open) fetchContext();
  }, [open, fetchContext]);

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
    </div>
  );
}
