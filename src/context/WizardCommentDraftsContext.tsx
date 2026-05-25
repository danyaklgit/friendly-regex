import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  SetTagSpecCommentPayload,
  TagSpecCommentTarget,
} from '../types/comments';
import { normaliseTarget } from '../utils/commentTarget';

/**
 * Sentinel form key used by drafts that target the TagSpec definition as a
 * whole (rather than a specific rule condition or attribute). The wizard's
 * tag-level comment icon uses this so a "comment on the tag itself" can be
 * queued before the definition's id is even known to the backend.
 */
export const WIZARD_DEFINITION_FORM_KEY = '__tagspec_definition__';

/**
 * A single draft comment queued inside the wizard. Drafts are keyed by the
 * wizard's form-level UUID (`condition.id` or `attribute.id`), or by
 * `WIZARD_DEFINITION_FORM_KEY` for tag-level drafts. The real
 * `TagSpecCommentTarget` is resolved from the form state at flush time,
 * after `tagSpecLibrarySave` returns.
 */
export interface WizardCommentDraft {
  id: string;
  formKey: string;
  kind: 'rule' | 'attribute' | 'definition';
  body: string;
  mentionIds: string[];
  targetLabel: string;
  createdAt: number;
}

export interface WizardCommentDraftsApi {
  drafts: WizardCommentDraft[];
  pendingCount: number;
  getDraftsForKey: (formKey: string) => WizardCommentDraft[];
  countForKey: (formKey: string) => number;
  addDraft: (input: Omit<WizardCommentDraft, 'id' | 'createdAt'>) => void;
  updateDraft: (id: string, body: string, mentionIds: string[]) => void;
  removeDraft: (id: string) => void;
  clearAll: () => void;
  /**
   * Flush all queued drafts via the supplied `postOne` callback (typically
   * `setTagSpecComment` from `src/api/comments.ts`, bound to current auth +
   * tepHeaders). Drafts whose `formKey` is absent from `targetByFormKey`
   * (e.g. the row was removed before save) are skipped silently. Drafts that
   * throw are counted as failed; the rest still flush. Returns a summary so
   * the caller can toast partial failures.
   */
  flushAll: (
    postOne: (payload: SetTagSpecCommentPayload) => Promise<void>,
    targetByFormKey: Map<string, TagSpecCommentTarget>,
    reportedByUserId: string,
  ) => Promise<{ posted: number; failed: number; skipped: number }>;
}

const WizardCommentDraftsContext = createContext<WizardCommentDraftsApi | null>(null);

/**
 * Returns the draft-store API. The state lives in this hook so a parent (e.g.
 * `TransactionsTab`) can both pass it down via context for descendants AND
 * call `flushAll` / `clearAll` directly in its save / close handlers without
 * an imperative ref dance.
 */
export function useWizardCommentDraftsState(): WizardCommentDraftsApi {
  const [drafts, setDrafts] = useState<WizardCommentDraft[]>([]);
  // Mirror into a ref so `getDraftsForKey`, `countForKey`, and `flushAll`
  // can keep stable identities while still reading the latest array.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const addDraft = useCallback(
    (input: Omit<WizardCommentDraft, 'id' | 'createdAt'>) => {
      setDrafts((prev) => [
        ...prev,
        { ...input, id: crypto.randomUUID(), createdAt: Date.now() },
      ]);
    },
    [],
  );

  const updateDraft = useCallback(
    (id: string, body: string, mentionIds: string[]) => {
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, body, mentionIds } : d)));
    },
    [],
  );

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setDrafts([]);
  }, []);

  const getDraftsForKey = useCallback((formKey: string) => {
    return draftsRef.current.filter((d) => d.formKey === formKey);
  }, []);

  const countForKey = useCallback((formKey: string) => {
    let count = 0;
    for (const d of draftsRef.current) if (d.formKey === formKey) count += 1;
    return count;
  }, []);

  const flushAll = useCallback(
    async (
      postOne: (payload: SetTagSpecCommentPayload) => Promise<void>,
      targetByFormKey: Map<string, TagSpecCommentTarget>,
      reportedByUserId: string,
    ) => {
      const current = draftsRef.current;
      const tasks = current.map(async (draft) => {
        const target = targetByFormKey.get(draft.formKey);
        if (!target) return 'skipped' as const;
        const payload: SetTagSpecCommentPayload = {
          Id: null,
          Status: 'ACTIVE',
          Comment: draft.body,
          ReportedByUserId: reportedByUserId,
          ReportedToUserIds: draft.mentionIds,
          Target: normaliseTarget(target),
        };
        try {
          await postOne(payload);
          return 'posted' as const;
        } catch (err) {
          // Surface to the console so a failed comment isn't completely silent;
          // the caller already aggregates counts into a toast.
          console.error('Failed to post deferred wizard comment', err);
          return 'failed' as const;
        }
      });
      const results = await Promise.all(tasks);
      let posted = 0;
      let failed = 0;
      let skipped = 0;
      for (const r of results) {
        if (r === 'posted') posted += 1;
        else if (r === 'failed') failed += 1;
        else skipped += 1;
      }
      return { posted, failed, skipped };
    },
    [],
  );

  return useMemo<WizardCommentDraftsApi>(
    () => ({
      drafts,
      pendingCount: drafts.length,
      getDraftsForKey,
      countForKey,
      addDraft,
      updateDraft,
      removeDraft,
      clearAll,
      flushAll,
    }),
    [
      drafts,
      getDraftsForKey,
      countForKey,
      addDraft,
      updateDraft,
      removeDraft,
      clearAll,
      flushAll,
    ],
  );
}

export function WizardCommentDraftsProvider({
  value,
  children,
}: {
  value: WizardCommentDraftsApi;
  children: ReactNode;
}) {
  return (
    <WizardCommentDraftsContext.Provider value={value}>
      {children}
    </WizardCommentDraftsContext.Provider>
  );
}

export function useWizardCommentDrafts(): WizardCommentDraftsApi {
  const ctx = useContext(WizardCommentDraftsContext);
  if (!ctx) {
    throw new Error(
      'useWizardCommentDrafts must be used within a WizardCommentDraftsProvider',
    );
  }
  return ctx;
}

/** Returns null when the caller is outside a wizard tree. */
export function useOptionalWizardCommentDrafts(): WizardCommentDraftsApi | null {
  return useContext(WizardCommentDraftsContext);
}
