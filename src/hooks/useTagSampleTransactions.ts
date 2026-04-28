import { useEffect, useRef, useState } from 'react';
import type { TransactionRow } from '../types';
import {
  DEFAULT_SORTING,
  getTransactions,
  type TepHeaders,
} from '../api/transactions';
import { useAuth } from '../context/AuthContext';
import { useTepConfig } from '../context/TepConfigContext';
import { useTransactionData } from './useTransactionData';

const SAMPLE_PAGE_SIZE = 50;

interface UseTagSampleTransactionsResult {
  /** null while idle (no definition selected) or before the first response. Empty array = no rows. */
  rows: TransactionRow[] | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches a small fresh sample of transactions tagged with the given
 * definition ID. Used by the read-only tag detail drawer that appears when
 * users click a tag in the live "Existing Matching Tags" preview.
 *
 * Stays silent (no fetch, returns `{ rows: null, loading: false, error: null }`) when:
 *  - `definitionId` is null
 *  - we are not in live mode (sample data has no per-tag-id index)
 */
export function useTagSampleTransactions(
  definitionId: string | null,
): UseTagSampleTransactionsResult {
  const { getAuthHeaders, userId, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();
  const { isLiveMode } = useTransactionData();
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!definitionId) {
      setRows(null);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    if (!isLiveMode) {
      // Sample data has no per-definition-id lookup — nothing meaningful to show.
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        await refreshIfNeeded();
        const authHeaders = getAuthHeaders();
        const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
        if (!token) {
          setLoading(false);
          return;
        }
        const tepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        const data = await getTransactions(
          {
            FilteringProperties: [
              {
                ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
                Value: definitionId,
                Operand: 'EQ',
              },
            ],
            SortingProperties: DEFAULT_SORTING,
            Pagination: { PageIndex: 0, PageSize: SAMPLE_PAGE_SIZE },
          },
          token,
          tepHeaders,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setRows(data.Transactions ?? []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const e = err instanceof Error ? err : new Error(String(err));
          if (e.name !== 'AbortError') {
            setError(e);
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // Function/object refs (getAuthHeaders, refreshIfNeeded, tepConfig) change every
    // render and would cause an infinite effect loop. The discrete inputs that
    // actually drive a refetch are definitionId and isLiveMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitionId, isLiveMode]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { rows, loading, error };
}
