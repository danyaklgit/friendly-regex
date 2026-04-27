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
import { TRANSFORMATION_METHODS, type TransformationMethodDef } from '../constants/transformations';

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
  transformationMethods: TransformationMethodDef[];

  // Actions
  refetchAll: () => Promise<void>;
  refetchAttributes: () => Promise<void>;
  createNewAttribute: (payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<string | null>;
  updateExistingAttribute: (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<string | null>;
  toggleAttributeStatus: (id: number, enable: boolean) => Promise<string | null>;
  deleteExistingAttribute: (id: number) => Promise<string | null>;
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

  const createNewAttribute = useCallback(async (payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiCreateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
  }, [authToken, tepHeaders, fetchAttrs]);

  const updateExistingAttribute = useCallback(async (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiUpdateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
  }, [authToken, tepHeaders, fetchAttrs]);

  const toggleAttributeStatus = useCallback(async (id: number, enable: boolean): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    let sfm: string | null;
    if (enable) {
      sfm = await apiEnableAttribute(id, authToken, tepHeaders);
    } else {
      sfm = await apiDisableAttribute(id, authToken, tepHeaders);
    }
    await fetchAttrs();
    return sfm;
  }, [authToken, tepHeaders, fetchAttrs]);

  const deleteExistingAttribute = useCallback(async (id: number): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiDeleteAttribute(id, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
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
        // Primary key: canonical Value (e.g. "SABBSARI" for BANKS).
        const primary = item.Value.trim();
        inner.set(primary, item.Name);
        // Also key by every entry in Tags (e.g. ["SABBSARI", "SABB", "45"])
        // so attributes that extract a shorter / alternate code (e.g. the
        // 4-char SWIFT prefix "SABB") still resolve to the friendly name.
        // Don't clobber an existing primary key.
        if (Array.isArray(item.Tags)) {
          for (const tag of item.Tags) {
            const t = String(tag).trim();
            if (t && !inner.has(t)) inner.set(t, item.Name);
          }
        }
      }
      map.set(list.Tag, inner);                  // "SADAD_BILLERS"
      if (!map.has(list.Name)) map.set(list.Name, inner);  // "SADAD Billers"
      const norm = normalize(list.Tag);
      if (!map.has(norm)) map.set(norm, inner);  // "sadadbillers"
    }
    return map;
  }, [lovLists]);

  // Derived: LOV options for dropdown.
  // Exclude internal LOV tags that aren't meant to surface as attribute value sources:
  //   - ATTRIBUTES: the list of available attribute names (used elsewhere).
  //   - ATTRIBUTE_TRANSFORMATON: the transformation method catalog (used by the transformation picker).
  const lovOptions = useMemo(() => {
    const HIDDEN_LOV_TAGS = new Set(['ATTRIBUTES', 'ATTRIBUTE_TRANSFORMATON']);
    return lovLists
      .filter((l) => !HIDDEN_LOV_TAGS.has(l.Tag))
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

  // Derived: transformation methods — use backend LOV list if available, fall back to local
  const transformationMethods = useMemo<TransformationMethodDef[]>(() => {
    const backendList = lovLists.find((l) => l.Tag === 'ATTRIBUTE_TRANSFORMATON');
    if (backendList && backendList.Items.length > 0) {
      return backendList.Items.map((item) => {
        const local = TRANSFORMATION_METHODS.find((m) => m.key === item.Value);
        return {
          key: item.Value,
          label: item.Name,
          description: item.Description,
          category: item.Tags?.[0] ?? local?.category ?? 'Other',
          args: local?.args ?? [],
        };
      });
    }
    return TRANSFORMATION_METHODS;
  }, [lovLists]);

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
    transformationMethods,
    refetchAll,
    refetchAttributes,
    createNewAttribute,
    updateExistingAttribute,
    toggleAttributeStatus,
    deleteExistingAttribute,
  }), [
    lovLists, validationClasses, backendAttributes,
    lovLoading, attributesLoading, validationLoading,
    lovLookup, lovOptions, activeAttributes, validationOptions, transformationMethods,
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
