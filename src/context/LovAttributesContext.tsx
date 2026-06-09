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
import { useAuth } from './AuthContext';

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
  createNewExtraction: (payload: { Value: string; Details: AttributeDetail[] }) => Promise<string | null>;
  updateExistingExtraction: (payload: { Id: number; Value: string; Details: AttributeDetail[] }) => Promise<string | null>;
  deleteExistingExtraction: (id: number) => Promise<string | null>;
}

const LovAttributesContext = createContext<LovAttributesContextValue | null>(null);

interface LovAttributesProviderProps {
  tepHeaders: TepHeaders | null;
  children: ReactNode;
}

export function LovAttributesProvider({ tepHeaders, children }: LovAttributesProviderProps) {
  // Read the access token at *call time* via `getAuthHeaders` (stable across
  // session rotations). Passing `authToken` as a prop forced the mount-fetch
  // effect to re-run on every silent keepalive, which surfaced LOV / attribute
  // loading states as a page-wide refresh whenever the operator clicked
  // "Get More Time" or the proactive refresh fired. See AuthContext for the
  // matching change.
  const { getAuthHeaders, isAuthenticated } = useAuth();
  const [lovLists, setLovLists] = useState<LOVList[]>([]);
  const [validationClasses, setValidationClasses] = useState<ValidationClass[]>([]);
  const [backendAttributes, setBackendAttributes] = useState<BackendAttribute[]>([]);
  const [backendExtractions, setBackendExtractions] = useState<BackendExtraction[]>([]);

  const [lovLoading, setLovLoading] = useState(false);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [extractionsLoading, setExtractionsLoading] = useState(false);

  const fetchLov = useCallback(async (signal?: AbortSignal) => {
    if (!tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    setLovLoading(true);
    try {
      const lists = await getListsByTags(authToken, tepHeaders, signal);
      if (!signal?.aborted) setLovLists(lists);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch LOV lists:', err);
    } finally {
      if (!signal?.aborted) setLovLoading(false);
    }
  }, [tepHeaders, getAuthHeaders]);

  const fetchValidation = useCallback(async (signal?: AbortSignal) => {
    if (!tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    setValidationLoading(true);
    try {
      const classes = await getValidationClasses(authToken, tepHeaders, signal);
      if (!signal?.aborted) setValidationClasses(classes);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch validation classes:', err);
    } finally {
      if (!signal?.aborted) setValidationLoading(false);
    }
  }, [tepHeaders, getAuthHeaders]);

  const fetchAttrs = useCallback(async (signal?: AbortSignal) => {
    if (!tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    setAttributesLoading(true);
    try {
      const attrs = await getAttributes(authToken, tepHeaders, signal);
      if (!signal?.aborted) setBackendAttributes(attrs);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch attributes:', err);
    } finally {
      if (!signal?.aborted) setAttributesLoading(false);
    }
  }, [tepHeaders, getAuthHeaders]);

  const fetchExtractions = useCallback(async (signal?: AbortSignal) => {
    if (!tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    setExtractionsLoading(true);
    try {
      const list = await getExtractions(authToken, tepHeaders, signal);
      if (!signal?.aborted) setBackendExtractions(list);
    } catch (err) {
      if (!signal?.aborted) console.error('Failed to fetch extractions:', err);
    } finally {
      if (!signal?.aborted) setExtractionsLoading(false);
    }
  }, [tepHeaders, getAuthHeaders]);

  // Fetch all on mount. Gate on `isAuthenticated` (a boolean that flips once
  // per login/logout) rather than the rotating access token, so silent
  // keepalives don't re-fire the entire LOV / validation / attribute /
  // extraction fetch cycle.
  useEffect(() => {
    if (!isAuthenticated || !tepHeaders) return;
    const controller = new AbortController();
    fetchLov(controller.signal);
    fetchValidation(controller.signal);
    fetchAttrs(controller.signal);
    fetchExtractions(controller.signal);
    return () => controller.abort();
  }, [isAuthenticated, tepHeaders, fetchLov, fetchValidation, fetchAttrs, fetchExtractions]);

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
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiCreateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchAttrs]);

  const updateExistingAttribute = useCallback(async (payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiUpdateAttribute(payload, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchAttrs]);

  const toggleAttributeStatus = useCallback(async (id: number, enable: boolean): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    let sfm: string | null;
    if (enable) {
      sfm = await apiEnableAttribute(id, authToken, tepHeaders);
    } else {
      sfm = await apiDisableAttribute(id, authToken, tepHeaders);
    }
    await fetchAttrs();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchAttrs]);

  const deleteExistingAttribute = useCallback(async (id: number): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiDeleteAttribute(id, authToken, tepHeaders);
    await fetchAttrs();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchAttrs]);

  // Extractions CRUD. The dropdown now reads `extractionMethods` directly from
  // `backendExtractions` (the regex lives in each extraction's `Value` field),
  // so a single refetch of the Extractions list is enough.
  const createNewExtraction = useCallback(async (payload: { Value: string; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiCreateExtraction(payload, authToken, tepHeaders);
    await fetchExtractions();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchExtractions]);

  const updateExistingExtraction = useCallback(async (payload: { Id: number; Value: string; Details: AttributeDetail[] }): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiUpdateExtraction(payload, authToken, tepHeaders);
    await fetchExtractions();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchExtractions]);

  const deleteExistingExtraction = useCallback(async (id: number): Promise<string | null> => {
    if (!tepHeaders) return null;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return null;
    const sfm = await apiDeleteExtraction(id, authToken, tepHeaders);
    await fetchExtractions();
    return sfm;
  }, [tepHeaders, getAuthHeaders, fetchExtractions]);

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
  //   - DEMO_USER_COMPS: the user-mode portal's company picker LOV. The
  //     backend ships it on every GetListsByTags response (it's in
  //     LOV_TAGS) but it has no operator-side use and exposing it as
  //     an attribute-value source would let operators accidentally bind
  //     a tag's attribute to internal user-mode state.
  const lovOptions = useMemo(() => {
    const HIDDEN_LOV_TAGS = new Set(['ATTRIBUTES', 'ATTRIBUTE_TRANSFORMATON', 'DEMO_USER_COMPS']);
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
        // Description fallback: prefer the backend's copy when it carries a
        // parseable example (contains an arrow), otherwise use the local
        // catalog's structured "Args/No args. Example: …" string. The
        // transformation dropdown's sublabel parses input→output pairs out
        // of this text and renders a rich preview; backend descriptions
        // like "Prepends a specified string…" are technically present but
        // carry no example, so without the local fallback those rows would
        // look bare next to their documented siblings (Pad Right, Date
        // Reformat, etc.).
        const backendDesc = item.Description?.trim();
        const backendHasArrow = !!backendDesc && /->|→/.test(backendDesc);
        const description = backendHasArrow
          ? backendDesc
          : (local?.description ?? backendDesc);
        return {
          key: item.Value,
          label: item.Name,
          description,
          category: item.Tags?.[0] ?? local?.category ?? 'Other',
          args: local?.args ?? [],
        };
      });
    }
    return TRANSFORMATION_METHODS;
  }, [lovLists]);

  // Derived: extraction methods sourced from the Extractions CRUD endpoint.
  // Each backend extraction stores the regex directly in `Value`, and the
  // English Details entry supplies the friendly Name/ShortDescription used as
  // dropdown label/description. Operation key stays `lov:<regex>` so
  // `regexifyExtraction` (a pure util with no catalog access) can produce the
  // stored regex by stripping the prefix.
  const extractionMethods = useMemo<ExtractionMethodDef[]>(() => {
    return activeExtractions
      .map((ext) => {
        const regex = ext.Value;
        const en = ext.Details.find((d) => d.LanguageCode === 'en');
        return {
          regex,
          label: en?.Name?.trim() || regex,
          description: en?.ShortDescription || undefined,
        };
      })
      .filter(({ regex }) => regex.length > 0)
      .map(({ regex, label, description }) => ({
        key: `lov:${regex}`,
        label,
        regex,
        description,
      }));
  }, [activeExtractions]);

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
