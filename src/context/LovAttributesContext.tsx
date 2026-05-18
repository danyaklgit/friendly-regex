import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { TepHeaders } from '../api/transactions';
import type { LOVList, ValidationClass, BackendAttribute, BackendExtraction, AttributeDetail, ExtractionMethodDef } from '../types/lov';
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
import {
  getExtractions,
  createExtraction as apiCreateExtraction,
  updateExtraction as apiUpdateExtraction,
  deleteExtraction as apiDeleteExtraction,
} from '../api/extractions';
import { TRANSFORMATION_METHODS, type TransformationMethodDef } from '../constants/transformations';

interface LovAttributesContextValue {
  // Raw data
  lovLists: LOVList[];
  validationClasses: ValidationClass[];
  backendAttributes: BackendAttribute[];
  backendExtractions: BackendExtraction[];

  // Loading states
  lovLoading: boolean;
  attributesLoading: boolean;
  validationLoading: boolean;
  extractionsLoading: boolean;

  // Derived
  lovLookup: Map<string, Map<string, string>>;
  lovOptions: { value: string; label: string }[];
  activeAttributes: BackendAttribute[];
  activeExtractions: BackendExtraction[];
  validationOptions: { value: string; label: string }[];
  transformationMethods: TransformationMethodDef[];
  extractionMethods: ExtractionMethodDef[];

  // Actions
  refetchAll: () => Promise<void>;
  refetchAttributes: () => Promise<void>;
  refetchExtractions: () => Promise<void>;
  createNewAttribute: (payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<string | null>;
  updateExistingAttribute: (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }) => Promise<string | null>;
  toggleAttributeStatus: (id: number, enable: boolean) => Promise<string | null>;
  deleteExistingAttribute: (id: number) => Promise<string | null>;
  createNewExtraction: (payload: { Value: string; Regex: string; Details: AttributeDetail[] }) => Promise<string | null>;
  updateExistingExtraction: (payload: { Id: number; Value: string; Regex: string; Details: AttributeDetail[] }) => Promise<string | null>;
  deleteExistingExtraction: (id: number) => Promise<string | null>;
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
  const [backendExtractions, setBackendExtractions] = useState<BackendExtraction[]>([]);

  const [lovLoading, setLovLoading] = useState(false);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [extractionsLoading, setExtractionsLoading] = useState(false);

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

  const fetchExtractions = useCallback(async (signal?: AbortSignal) => {
    if (!authToken || !tepHeaders) return;
    setExtractionsLoading(true);
    try {
      const list = await getExtractions(authToken, tepHeaders, signal);
      if (!signal?.aborted) setBackendExtractions(list);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch extractions:', err);
    } finally {
      if (!signal?.aborted) setExtractionsLoading(false);
    }
  }, [authToken, tepHeaders]);

  // Fetch all on mount
  useEffect(() => {
    if (!authToken || !tepHeaders) return;
    const controller = new AbortController();
    fetchLov(controller.signal);
    fetchValidation(controller.signal);
    fetchAttrs(controller.signal);
    fetchExtractions(controller.signal);
    return () => controller.abort();
  }, [authToken, tepHeaders, fetchLov, fetchValidation, fetchAttrs, fetchExtractions]);

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchLov(), fetchValidation(), fetchAttrs(), fetchExtractions()]);
  }, [fetchLov, fetchValidation, fetchAttrs, fetchExtractions]);

  const refetchAttributes = useCallback(async () => {
    await fetchAttrs();
  }, [fetchAttrs]);

  const refetchExtractions = useCallback(async () => {
    await fetchExtractions();
  }, [fetchExtractions]);

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

  // Extractions CRUD. Each mutation refetches BOTH the Extractions list and
  // the LOV (since the dropdown reads `extractionMethods` from the EXTRACTIONS
  // LOV, not from `backendExtractions`).
  const createNewExtraction = useCallback(async (payload: { Value: string; Regex: string; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiCreateExtraction(payload, authToken, tepHeaders);
    await Promise.all([fetchExtractions(), fetchLov()]);
    return sfm;
  }, [authToken, tepHeaders, fetchExtractions, fetchLov]);

  const updateExistingExtraction = useCallback(async (payload: { Id: number; Value: string; Regex: string; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiUpdateExtraction(payload, authToken, tepHeaders);
    await Promise.all([fetchExtractions(), fetchLov()]);
    return sfm;
  }, [authToken, tepHeaders, fetchExtractions, fetchLov]);

  const deleteExistingExtraction = useCallback(async (id: number): Promise<string | null> => {
    if (!authToken || !tepHeaders) return null;
    const sfm = await apiDeleteExtraction(id, authToken, tepHeaders);
    await Promise.all([fetchExtractions(), fetchLov()]);
    return sfm;
  }, [authToken, tepHeaders, fetchExtractions, fetchLov]);

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

  const activeExtractions = useMemo(() => {
    return backendExtractions.filter((e) => e.StatusTag === 'ACTIVE' || e.StatusTag === null);
  }, [backendExtractions]);

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

  // Derived: extraction methods sourced from the EXTRACTIONS LOV.
  //   - Value  = tag identifier (e.g. "KSA_IBAN", "SWIFT_BIC")
  //   - Name   = display label
  //   - Tags[0] = the actual regex
  // Operation key is `lov:<regex>` so `regexifyExtraction` (a pure util with
  // no LOV access) can produce the stored regex by stripping the prefix.
  // Items without a regex are skipped — a regex-less entry isn't usable.
  const extractionMethods = useMemo<ExtractionMethodDef[]>(() => {
    const list = lovLists.find((l) => l.Tag === 'EXTRACTIONS');
    if (!list) return [];
    return list.Items
      .map((item) => {
        const regex = Array.isArray(item.Tags) && item.Tags[0] ? item.Tags[0] : '';
        return { regex, item };
      })
      .filter(({ regex }) => regex.length > 0)
      .map(({ regex, item }) => ({
        key: `lov:${regex}`,
        label: item.Name || item.Value,
        regex,
        description: item.Description,
      }));
  }, [lovLists]);

  const value = useMemo<LovAttributesContextValue>(() => ({
    lovLists,
    validationClasses,
    backendAttributes,
    backendExtractions,
    lovLoading,
    attributesLoading,
    validationLoading,
    extractionsLoading,
    lovLookup,
    lovOptions,
    activeAttributes,
    activeExtractions,
    validationOptions,
    transformationMethods,
    extractionMethods,
    refetchAll,
    refetchAttributes,
    refetchExtractions,
    createNewAttribute,
    updateExistingAttribute,
    toggleAttributeStatus,
    deleteExistingAttribute,
    createNewExtraction,
    updateExistingExtraction,
    deleteExistingExtraction,
  }), [
    lovLists, validationClasses, backendAttributes, backendExtractions,
    lovLoading, attributesLoading, validationLoading, extractionsLoading,
    lovLookup, lovOptions, activeAttributes, activeExtractions, validationOptions, transformationMethods, extractionMethods,
    refetchAll, refetchAttributes, refetchExtractions,
    createNewAttribute, updateExistingAttribute, toggleAttributeStatus, deleteExistingAttribute,
    createNewExtraction, updateExistingExtraction, deleteExistingExtraction,
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
