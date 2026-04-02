import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { TepHeaders } from '../api/transactions';
import type { LOVList, ValidationClass, BackendAttribute, AttributeDetail } from '../types/lov';
import {
  getListsByTags,
  getValidationClasses,
  getAttributes,
  createAttribute as apiCreateAttribute,
  updateAttribute as apiUpdateAttribute,
  disableAttribute as apiDisableAttribute,
  enableAttribute as apiEnableAttribute,
  deleteAttribute as apiDeleteAttribute,
} from '../api/lovAttributes';

interface LovAttributesContextValue {
  // Raw data
  lovLists: LOVList[];
  validationClasses: ValidationClass[];
  backendAttributes: BackendAttribute[];

  // Loading states
  lovLoading: boolean;
  attributesLoading: boolean;
  validationLoading: boolean;

  // Derived
  lovLookup: Map<string, Map<string, string>>;
  lovOptions: { value: string; label: string }[];
  activeAttributes: BackendAttribute[];
  validationOptions: { value: string; label: string }[];

  // Actions
  refetchAll: () => Promise<void>;
  refetchAttributes: () => Promise<void>;
  createNewAttribute: (payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<void>;
  updateExistingAttribute: (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<void>;
  toggleAttributeStatus: (id: number, enable: boolean) => Promise<void>;
  deleteExistingAttribute: (id: number) => Promise<void>;
}

const LovAttributesContext = createContext<LovAttributesContextValue | null>(null);

interface LovAttributesProviderProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  children: ReactNode;
}

export function LovAttributesProvider({ authToken, tepHeaders, children }: LovAttributesProviderProps) {
  const [lovLists, setLovLists] = useState<LOVList[]>([]);
  const [validationClasses, setValidationClasses] = useState<ValidationClass[]>([]);
  const [backendAttributes, setBackendAttributes] = useState<BackendAttribute[]>([]);

  const [lovLoading, setLovLoading] = useState(false);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);

  const fetchLov = useCallback(async (signal?: AbortSignal) => {
    if (!authToken || !tepHeaders) return;
    setLovLoading(true);
    try {
      const lists = await getListsByTags(authToken, tepHeaders, signal);
      if (!signal?.aborted) setLovLists(lists);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch LOV lists:', err);
    } finally {
      if (!signal?.aborted) setLovLoading(false);
    }
  }, [authToken, tepHeaders]);

  const fetchValidation = useCallback(async (signal?: AbortSignal) => {
    if (!authToken || !tepHeaders) return;
    setValidationLoading(true);
    try {
      const classes = await getValidationClasses(authToken, tepHeaders, signal);
      if (!signal?.aborted) setValidationClasses(classes);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch validation classes:', err);
    } finally {
      if (!signal?.aborted) setValidationLoading(false);
    }
  }, [authToken, tepHeaders]);

  const fetchAttrs = useCallback(async (signal?: AbortSignal) => {
    if (!authToken || !tepHeaders) return;
    setAttributesLoading(true);
    try {
      const attrs = await getAttributes(authToken, tepHeaders, signal);
      if (!signal?.aborted) setBackendAttributes(attrs);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch attributes:', err);
    } finally {
      if (!signal?.aborted) setAttributesLoading(false);
    }
  }, [authToken, tepHeaders]);

  // Fetch all on mount
  useEffect(() => {
    if (!authToken || !tepHeaders) return;
    const controller = new AbortController();
    fetchLov(controller.signal);
    fetchValidation(controller.signal);
    fetchAttrs(controller.signal);
    return () => controller.abort();
  }, [authToken, tepHeaders, fetchLov, fetchValidation, fetchAttrs]);

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchLov(), fetchValidation(), fetchAttrs()]);
  }, [fetchLov, fetchValidation, fetchAttrs]);

  const refetchAttributes = useCallback(async () => {
    await fetchAttrs();
  }, [fetchAttrs]);

  const createNewAttribute = useCallback(async (payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => {
    if (!authToken || !tepHeaders) return;
    await apiCreateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
  }, [authToken, tepHeaders, fetchAttrs]);

  const updateExistingAttribute = useCallback(async (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => {
    if (!authToken || !tepHeaders) return;
    await apiUpdateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
  }, [authToken, tepHeaders, fetchAttrs]);

  const toggleAttributeStatus = useCallback(async (id: number, enable: boolean) => {
    if (!authToken || !tepHeaders) return;
    if (enable) {
      await apiEnableAttribute(id, authToken, tepHeaders);
    } else {
      await apiDisableAttribute(id, authToken, tepHeaders);
    }
    await fetchAttrs();
  }, [authToken, tepHeaders, fetchAttrs]);

  const deleteExistingAttribute = useCallback(async (id: number) => {
    if (!authToken || !tepHeaders) return;
    await apiDeleteAttribute(id, authToken, tepHeaders);
    await fetchAttrs();
  }, [authToken, tepHeaders, fetchAttrs]);

  // Derived: LOV lookup — LOVTag → (Value → Name)
  // Index by Tag, Name, and normalized key so resolution works regardless of
  // how LOVTag is stored (API Tag "SADAD_BILLERS", Name "SADAD Billers",
  // or PossibleLOVTag "SadadBillers" from the backend attributes).
  const lovLookup = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    const normalize = (s: string) => s.replace(/[_ ]/g, '').toLowerCase();
    for (const list of lovLists) {
      const inner = new Map<string, string>();
      for (const item of list.Items) {
        inner.set(item.Value.trim(), item.Name);
      }
      map.set(list.Tag, inner);                  // "SADAD_BILLERS"
      if (!map.has(list.Name)) map.set(list.Name, inner);  // "SADAD Billers"
      const norm = normalize(list.Tag);
      if (!map.has(norm)) map.set(norm, inner);  // "sadadbillers"
    }
    return map;
  }, [lovLists]);

  // Derived: LOV options for dropdown (exclude ATTRIBUTES tag)
  const lovOptions = useMemo(() => {
    return lovLists
      .filter((l) => l.Tag !== 'ATTRIBUTES')
      .map((l) => ({ value: l.Tag, label: l.Name }));
  }, [lovLists]);

  // Derived: active attributes (ACTIVE or null status)
  const activeAttributes = useMemo(() => {
    return backendAttributes.filter((a) => a.StatusTag === 'ACTIVE' || a.StatusTag === null);
  }, [backendAttributes]);

  // Derived: validation options
  const validationOptions = useMemo(() => {
    return validationClasses.map((vc) => ({ value: vc.Tag, label: vc.Name }));
  }, [validationClasses]);

  const value = useMemo<LovAttributesContextValue>(() => ({
    lovLists,
    validationClasses,
    backendAttributes,
    lovLoading,
    attributesLoading,
    validationLoading,
    lovLookup,
    lovOptions,
    activeAttributes,
    validationOptions,
    refetchAll,
    refetchAttributes,
    createNewAttribute,
    updateExistingAttribute,
    toggleAttributeStatus,
    deleteExistingAttribute,
  }), [
    lovLists, validationClasses, backendAttributes,
    lovLoading, attributesLoading, validationLoading,
    lovLookup, lovOptions, activeAttributes, validationOptions,
    refetchAll, refetchAttributes, createNewAttribute,
    updateExistingAttribute, toggleAttributeStatus, deleteExistingAttribute,
  ]);

  return (
    <LovAttributesContext.Provider value={value}>
      {children}
    </LovAttributesContext.Provider>
  );
}

export function useLovAttributes() {
  const context = useContext(LovAttributesContext);
  if (!context) throw new Error('useLovAttributes must be used within LovAttributesProvider');
  return context;
}
