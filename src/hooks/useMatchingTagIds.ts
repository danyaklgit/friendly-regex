import { useEffect, useRef, useState } from 'react';
import type { WizardFormState } from '../types';
import type { TepHeaders, FilterProperty } from '../api/transactions';
import { getAllTransactionTags } from '../api/transactions';
import { buildRulesetFilters } from '../utils/buildRulesetFilters';
import { useAuth } from '../context/AuthContext';
import { useTepConfig } from '../context/TepConfigContext';
import { useTransactionData } from './useTransactionData';

// Long enough that a deliberate pause mid-typing won't fire mid-thought.
// Anything shorter (e.g. 400ms) re-fires on natural keystroke pauses, which
// feels like "every character." 1200ms maps to "I clearly stopped typing."
const DEBOUNCE_MS = 700;

interface UseMatchingTagIdsResult {
  /** null while disabled or before the first response. Empty array = no matches. */
  ids: string[] | null;
  loading: boolean;
}

/**
 * Live preview of which existing tag definition IDs match the rule the user
 * is currently authoring. Fires `GetAllTransactionTags` whenever the form
 * state's matching criteria change, debounced and abortable.
 *
 * Stays silent (no fetch, returns `{ ids: null, loading: false }`) when:
 *  - `enabled` is false (e.g. builder is closed)
 *  - we are not in live mode (sample data)
 *  - bankSwiftCode or side is missing (payload would be invalid)
 */
export function useMatchingTagIds(
  formState: WizardFormState,
  enabled: boolean,
): UseMatchingTagIdsResult {
  const { getAuthHeaders, userId, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();
  const { isLiveMode } = useTransactionData();
  const [ids, setIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build the payload outside the effect so its identity is content-derived
  // and stable strings can drive the dependency array. We stringify once
  // because comparing arrays of nested objects by reference re-fires on every
  // keystroke even when the content is unchanged.
  const payload: FilterProperty[] | null = enabled && isLiveMode && formState.bankSwiftCode && formState.side
    ? buildRulesetFilters(formState)
    : null;
  const payloadKey = payload ? JSON.stringify(payload) : null;

  useEffect(() => {
    if (!payloadKey || !payload) {
      // Reset state when disabled — caller will hide the section.
      setIds(null);
      setLoading(false);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const timer = setTimeout(async () => {
      // Cancel any in-flight call from an earlier debounce window.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

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
        const result = await getAllTransactionTags(
          { FilteringProperties: payload },
          token,
          tepHeaders,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setIds(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          // Non-critical preview — log and leave previous tags visible.
          console.error('GetAllTransactionTags failed:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  // Abort any pending request when the consumer unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { ids, loading };
}
