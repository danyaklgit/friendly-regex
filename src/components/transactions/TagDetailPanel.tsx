import { useEffect, useRef } from 'react';
import type { TagSpecDefinition, TagAttribute, TransactionRow, CertaintyLevelTag } from '../../types';
import { Badge } from '../shared/Badge';
import { CopyableId } from '../shared/CopyableId';
import { RuleExpressionView } from '../tagRules/RuleExpressionView';
import { useTagSampleTransactions } from '../../hooks/useTagSampleTransactions';
import { getContextValue, getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

const DATE_FIELDS = new Set(['StatementDate', 'EntryDate', 'ValueDate']);

interface TagDetailPanelProps {
  open: boolean;
  definition: TagSpecDefinition | null;
  source: string;
  isUserCreated: boolean;
  onClose: () => void;
}

// Mirrors DEFAULT_VISIBLE_COLUMN_KEYS from TransactionTable so the panel's
// preview reads the same as the main page table.
const TX_COLUMNS: { field: string }[] = [
  { field: 'StatementDate' },
  { field: 'TransactionTypeCode' },
  { field: 'IBAN' },
  { field: 'CurrencyCode' },
  { field: 'BankReference' },
  { field: 'Description1' },
  { field: 'Description2' },
  { field: 'AdditionalInformation' },
];

const certaintyAccent: Record<CertaintyLevelTag, { bar: string; text: string; bg: string }> = {
  HIGH: { bar: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
  MEDIUM: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  LOW: { bar: 'bg-slate-400', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/40' },
};

export function TagDetailPanel({
  open,
  definition,
  source,
  isUserCreated,
  onClose,
}: TagDetailPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const { rows, loading, error } = useTagSampleTransactions(
    open && definition ? definition.Id : null,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const certainty: CertaintyLevelTag = definition?.CertaintyLevelTag ?? 'HIGH';
  const accent = certaintyAccent[certainty];

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        role="dialog"
        aria-label={definition ? `Details for tag ${definition.Tag}` : 'Tag details'}
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 w-full md:w-[44%] lg:w-[38%] max-w-[680px] bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'
        }`}
      >
        <div className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`} aria-hidden />

        {definition && (
          <>
            <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-6 pt-5 pb-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase mb-1">
                    Tag Definition
                    {isUserCreated && (
                      <span className="ml-2 text-orange-600 dark:text-orange-400 normal-case tracking-normal">
                        · user-created
                      </span>
                    )}
                  </div>
                  <h2 className="font-mono text-[19px] font-semibold text-heading leading-tight break-words">
                    {definition.Tag}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                      TagSpec Id
                    </span>
                    <CopyableId id={definition.Id} truncateAt={12} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.bg} ${accent.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${accent.bar}`} />
                      {certainty} certainty
                    </span>
                    {(() => {
                      const txnType = getContextValue(definition.Context, 'TransactionTypeCode');
                      return txnType ? (
                        <Badge variant="info" size="xs">{txnType}</Badge>
                      ) : null;
                    })()}
                    <Badge variant="default" size="xs">{source}</Badge>
                    <Badge
                      variant={definition.StatusTag === 'ACTIVE' ? 'success' : 'default'}
                      size="xs"
                    >
                      {definition.StatusTag}
                    </Badge>
                  </div>
                </div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close tag details"
                  className="shrink-0 p-1.5 rounded-md hover:bg-surface-tertiary text-body-secondary hover:text-body transition-colors"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
              <section>
                <SectionHeading>Rules</SectionHeading>
                {definition.TagRuleExpressions.length === 0 ? (
                  <p className="text-sm text-faint italic">
                    No rules — this tag matches by context only.
                  </p>
                ) : (
                  // Compact text scale + non-wrapping pills so each condition
                  // sits on a single line in the narrow drawer when it can.
                  <div className="[&_.text-sm]:text-[11px] [&_.text-xs]:text-[10px] [&_.font-mono]:whitespace-nowrap">
                    <RuleExpressionView expressions={definition.TagRuleExpressions} />
                  </div>
                )}
              </section>

              <section>
                <SectionHeading>Attributes</SectionHeading>
                {definition.Attributes.length === 0 ? (
                  <p className="text-sm text-faint italic">No attributes defined.</p>
                ) : (
                  <div className="space-y-1.5">
                    {definition.Attributes.map((attr, i) => (
                      <AttributeRow key={i} attribute={attr} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-baseline justify-between mb-2.5">
                  <SectionHeading className="mb-0">Recent transactions</SectionHeading>
                  {rows && rows.length > 0 && (
                    <span className="text-[10px] font-mono text-faint">
                      {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                    </span>
                  )}
                </div>
                <TransactionsSampleTable
                  rows={rows}
                  loading={loading}
                  error={error}
                />
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function SectionHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={`text-[10px] font-semibold text-body-secondary uppercase tracking-[0.16em] mb-2.5 flex items-center gap-2 ${className}`}
    >
      <span>{children}</span>
      <span className="flex-1 h-px bg-border" aria-hidden />
    </h3>
  );
}

function AttributeRow({ attribute }: { attribute: TagAttribute }) {
  const expr = attribute.AttributeRuleExpression;
  const humanText =
    getRegexDescription(expr.RegexDetails) ||
    expr.ExpressionPrompt ||
    engregxify(expr.Regex);
  const sourceField = humanizeFieldName(expr.SourceField);
  const fullText = `${attribute.AttributeTag} · ${sourceField} · ${humanText}`;

  return (
    <div
      className="flex items-center gap-2.5 py-2 px-3 rounded-md bg-surface-secondary border border-border/60 hover:border-border transition-colors min-w-0"
      title={fullText}
    >
      <span className="font-mono text-[12px] font-medium text-primary shrink-0 max-w-[40%] truncate">
        {attribute.AttributeTag}
      </span>
      {attribute.IsMandatory && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-red-500 shrink-0">
          Required
        </span>
      )}
      <span className="font-mono text-[10px] text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[35%]">
        {sourceField}
      </span>
      <span className="text-[12px] text-orange-500 dark:text-orange-400 truncate flex-1 min-w-0">
        {humanText}
      </span>
    </div>
  );
}

interface TransactionsSampleTableProps {
  rows: TransactionRow[] | null;
  loading: boolean;
  error: Error | null;
}

function TransactionsSampleTable({ rows, loading, error }: TransactionsSampleTableProps) {
  if (loading && (rows == null || rows.length === 0)) {
    return (
      <div className="border border-border rounded-md px-3 py-6 text-center">
        <p className="text-sm text-faint italic">Loading transactions…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-3">
        <p className="text-sm text-red-700 dark:text-red-300">
          Couldn't load transactions for this tag.
        </p>
      </div>
    );
  }
  if (rows == null) {
    return null;
  }
  if (rows.length === 0) {
    return (
      <div className="border border-border border-dashed rounded-md px-3 py-6 text-center">
        <p className="text-sm text-faint italic">
          No transactions are currently tagged with this definition.
        </p>
      </div>
    );
  }
  return (
    <div className="max-h-[320px] overflow-auto custom-scrollbar border border-border rounded-md">
      <table className="min-w-full divide-y divide-divide">
        <thead className="bg-surface-secondary">
          <tr>
            {TX_COLUMNS.map((c) => (
              <th
                key={c.field}
                className="sticky top-0 z-10 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-body-secondary bg-surface-secondary"
              >
                {humanizeFieldName(c.field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface divide-y divide-divide">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-hover transition-colors">
              {TX_COLUMNS.map((c) => (
                <td
                  key={c.field}
                  className="px-3 py-2 text-xs text-body-secondary whitespace-nowrap"
                  title={formatTxCell(c.field, row[c.field])}
                >
                  {renderTxCell(c.field, row[c.field])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTxCell(field: string, value: TransactionRow[string]): string {
  if (value == null) return '';
  const raw = String(value);
  return DATE_FIELDS.has(field) ? raw.split('T')[0] : raw;
}

function renderTxCell(field: string, value: TransactionRow[string]) {
  if (value == null) return <span className="text-faint">-</span>;
  return formatTxCell(field, value);
}
