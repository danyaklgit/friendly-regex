import { useCallback } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { useTransactionData } from './useTransactionData';
import { useAuth } from '../context/AuthContext';
import { useTepConfig } from '../context/TepConfigContext';
import { saveTagsHierarchy } from '../api/tagsHierarchy';
import type { TepHeaders } from '../api/transactions';

export function useSyncTags() {
  const { rawHierarchyNodes, hierarchyWrapper, setOriginalRawNodes, refetchHierarchy } = useTagSpecs();
  const { fetchFilterDefinitions } = useTransactionData();
  const { getAuthHeaders, userId, useDummyData } = useAuth();
  const tepConfig = useTepConfig();

  return useCallback(async (): Promise<void> => {
    if (!hierarchyWrapper) throw new Error('No hierarchy loaded');

    if (useDummyData) {
      setOriginalRawNodes([...rawHierarchyNodes]);
      await new Promise((r) => setTimeout(r, 2000));
      await refetchHierarchy();
      return;
    }

    const headers = getAuthHeaders();
    const authRaw = headers['Authorization'];
    const authToken = authRaw?.startsWith('Bearer ') ? authRaw.slice(7) : null;
    if (!authToken || !userId) throw new Error('Not authenticated');

    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };

    const payload = { ...hierarchyWrapper, TagsHierarchy: rawHierarchyNodes };
    await saveTagsHierarchy(authToken, tepHeaders, payload);
    await refetchHierarchy();
    // Tags are an input to the Transactions filter bar (tag dropdown options
    // come from /get-filters, not the hierarchy itself). Invalidate the
    // cached filter definitions so newly-synced tags appear without a reload.
    await fetchFilterDefinitions();
  }, [hierarchyWrapper, rawHierarchyNodes, useDummyData, getAuthHeaders, userId, tepConfig, setOriginalRawNodes, refetchHierarchy, fetchFilterDefinitions]);
}
