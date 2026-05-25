import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import {
  getDistinctFieldValues,
  type DistinctFieldValuesResult,
} from '../../api/distinctFieldValues';
import type { FilterProperty, TepHeaders } from '../../api/transactions';

interface DistinctValuesModalProps {
  open: boolean;
  onClose: () => void;
  /** Already humanized name used in the modal title. */
  attributeName: string;
  /** The attribute's tag — used as `FieldName` and the `SortingProperties`
   *  `ColumnName` in the GetDistinctFieldValues API call. The backend resolves
   *  attributes by their tag, so we send the attribute identifier here, NOT
   *  the raw transaction source field. When this is empty (e.g., a new
   *  unsaved attribute) the modal short-circuits to an empty state and skips
   *  the network call. */
  attributeTag: string;
  /** The raw MT940 field this attribute extracts from. Displayed in the
   *  modal subtitle as a reminder of which field the operator is looking
   *  at; NOT sent to the API. */
  sourceField: string;
  /** Scopes the API call to the active checkout. Both optional because the
   *  editor is also used on preview surfaces with no checkout — there we
   *  fall back to a friendly empty state instead of calling the API. */
  bankSwiftCode?: string;
  side?: string;
  /** Optional LOV resolution map (raw value -> friendly name) so the modal
   *  can preserve the existing "<name> (raw)" display for LOV-based
   *  attributes. */
  lovMap?: Map<string, string>;
  /** Override the modal stacking. Defaults to `z-[60]` so the backend
   *  popup overlays the in-memory distinct-values modal it's launched from. */
  zClass?: string;
}

const PAGE_SIZE = 250;

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded border border-border bg-surface-secondary px-3 py-1.5 animate-pulse flex items-center gap-2">
      <div className="h-4 w-4 rounded-full bg-surface-tertiary" />
      <div className="h-3 flex-1 bg-surface-tertiary rounded" />
      <div className="h-4 w-8 bg-surface-tertiary rounded-full" />
    </div>
  );
}

function ValidIcon({ isValid }: { isValid: boolean | null }) {
  if (isValid === true) {
    return (
      <Tooltip placement="top" content="Valid in all tagged transactions">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex-shrink-0">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Tooltip>
    );
  }
  if (isValid === false) {
    return (
      <Tooltip placement="top" content="Some tagged transactions failed validation">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 flex-shrink-0">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
          </svg>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip placement="top" content="Not tagged yet">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-surface-tertiary text-faint flex-shrink-0">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M3 8H13" strokeLinecap="round" />
        </svg>
      </span>
    </Tooltip>
  );
}

/**
 * Backend-sourced distinct-values browser. Replaces the old in-memory list
 * that was capped by whatever page the operator had paginated to. Issues a
 * single `GetDistinctFieldValues` POST scoped to bank + side and surfaces
 * the per-value `IsValid` flag (✓ / ✗ / –) alongside the summary counters
 * returned by the API.
 */
export function DistinctValuesModal({
  open,
  onClose,
  attributeName,
  attributeTag,
  sourceField,
  bankSwiftCode,
  side,
  lovMap,
  zClass = 'z-[60]',
}: DistinctValuesModalProps) {
  const auth = useAuth();
  const tepConfig = useTepConfig();
  const { getAuthHeaders, refreshIfNeeded, userId } = auth;

  const tepHeaders = useMemo<TepHeaders | null>(() => {
    if (!userId) return null;
    return {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DistinctFieldValuesResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;

    // Backend keys distinct-value queries by attribute tag (not source
    // field), so an unsaved/unnamed attribute can't produce a meaningful
    // query — show the empty state instead of sending an invalid
    // FieldName.
    if (!attributeTag) {
      setLoading(false);
      setError(null);
      setData({
        Items: [], TotalDistinctCount: 0, TotalValidated: 0, TotalNotValid: 0, TotalNotTagged: 0,
      });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        await refreshIfNeeded();
        if (controller.signal.aborted) return;
        const authHeader = getAuthHeaders().Authorization ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
        if (!token || !tepHeaders) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const filters: FilterProperty[] = [];
        if (bankSwiftCode) filters.push({ ColumnName: 'BankSwiftCode', Value: bankSwiftCode, Operand: 'EQ' });
        if (side) filters.push({ ColumnName: 'Side', Value: side, Operand: 'EQ' });

        const result = await getDistinctFieldValues(
          {
            FieldName: attributeTag,
            FilteringProperties: filters,
            SortingProperties: [{ ColumnName: attributeTag, SortingLevel: 1, SortingOrder: 'ASC' }],
            Pagination: { PageIndex: 0, PageSize: PAGE_SIZE },
          },
          token,
          tepHeaders,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load distinct values');
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, attributeTag, bankSwiftCode, side, reloadKey, getAuthHeaders, refreshIfNeeded, tepHeaders]);

  if (!open) return null;

  const title = `Distinct values for "${attributeName}"`;
  const showSummary = !!data && data.Items.length > 0;
  const showTruncationNote = !!data && data.TotalDistinctCount > data.Items.length;

  return (
    <Modal open onClose={onClose} title={title} zClass={zClass}>
      <div className="text-xs text-faint mb-3">Source field: <span className="font-mono">{sourceField || '(none)'}</span></div>

      {showSummary && (
        <div className="flex items-center gap-3 mb-3 text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold">{data!.TotalValidated}</span>
            <span className="text-muted">validated</span>
          </span>
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
            </svg>
            <span className="font-semibold">{data!.TotalNotValid}</span>
            <span className="text-muted">invalid</span>
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M3 8H13" strokeLinecap="round" />
            </svg>
            <span className="font-semibold">{data!.TotalNotTagged}</span>
            <span>untagged</span>
          </span>
          <span className="text-faint">·</span>
          <span className="text-faint">
            <span className="font-semibold">{data!.TotalDistinctCount}</span> distinct values total
          </span>
        </div>
      )}

      {loading && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Spinner /> Loading distinct values…
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setReloadKey((k) => k + 1)} className="text-red-700 dark:text-red-300">
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && data && data.Items.length === 0 && (
        <div className="text-center py-6 text-sm text-muted">
          No distinct values found for this field in the current checkout.
        </div>
      )}

      {!loading && !error && data && data.Items.length > 0 && (
        <div className="space-y-1">
          {data.Items.map((item, i) => {
            const raw = item.FieldValue;
            const resolved = lovMap?.get(raw);
            return (
              <div
                key={`${raw}-${i}`}
                className="px-3 py-1.5 text-sm bg-surface-secondary rounded border border-border dark:text-primary-light flex items-center gap-2"
              >
                <ValidIcon isValid={item.IsValid} />
                <span className="font-mono flex-1 truncate">
                  {resolved ? (
                    <>
                      {resolved} <span className="text-faint text-xs">({raw})</span>
                    </>
                  ) : raw === '' ? (
                    <span className="italic text-muted">(empty)</span>
                  ) : (
                    raw
                  )}
                </span>
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-surface-tertiary text-faint text-xs font-medium">
                  {item.Count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showTruncationNote && (
        <div className="mt-3 text-xs italic text-faint text-center">
          Showing first {data!.Items.length} of {data!.TotalDistinctCount} distinct values.
        </div>
      )}
    </Modal>
  );
}
