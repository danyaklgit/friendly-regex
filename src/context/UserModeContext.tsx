import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  loadContributions,
  saveContributions,
  type Contribution,
} from '../utils/userMode/contributionStorage';
import {
  loadCustomTags,
  saveCustomTags,
  type CustomTag,
} from '../utils/userMode/customTagsStorage';

/**
 * User-mode session state. Only mounted under the `role=user` branch in
 * `App.tsx`, so non-user sessions never pay the cost of these hooks or write
 * to the underlying localStorage keys.
 *
 * Responsibilities:
 *   - Track the currently selected demo company (re-renders the portal between
 *     the picker view and the transactions view).
 *   - Hold the redaction-on/off flag in memory ONLY. Session-scoped by user
 *     decision — closing the tab or logging out re-enables redaction.
 *   - Own the contributions log (per-user) and custom-tag list (device-wide).
 *     Add/revert helpers persist after each mutation.
 */

const PRO_MODE_KEY = 'tep:userProMode';

function loadProMode(): boolean {
  try {
    return localStorage.getItem(PRO_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A bank the user picked on the multiselect entry screen. `swift` is the SWIFT
 *  code (the scoping key + GetUserFilters `Banks` value); `name` is the display
 *  label from the BANKS LOV. */
export interface BankSelection {
  swift: string;
  name: string;
}

interface UserModeContextValue {
  // Bank selection (multiselect — replaces the old single-company scope)
  selectedBanks: BankSelection[];
  setSelectedBanks: (banks: BankSelection[]) => void;

  // PRO mode — exposes the power-user surface (filters, tag/group/attribute
  // columns, contributions). OFF by default, persisted device-wide.
  proMode: boolean;
  setProMode: (next: boolean) => void;

  // Redaction (session-scoped, NOT persisted)
  redactionOn: boolean;
  setRedactionOn: (next: boolean) => void;

  // Contributions (per-user localStorage)
  contributions: Contribution[];
  addContribution: (c: Contribution) => void;
  revertContribution: (transactionId: string) => void;

  // Custom tags (device-wide localStorage)
  customTags: CustomTag[];
  addCustomTag: (tag: CustomTag) => void;
}

const UserModeContext = createContext<UserModeContextValue | null>(null);

export function UserModeProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();

  const [selectedBanks, setSelectedBanks] = useState<BankSelection[]>([]);
  const [redactionOn, setRedactionOn] = useState<boolean>(true);

  // PRO mode persists across sessions on this device (a deliberate, sticky
  // preference — unlike redaction, which re-arms each session).
  const [proMode, setProModeState] = useState<boolean>(() => loadProMode());
  const setProMode = useCallback((next: boolean) => {
    setProModeState(next);
    try {
      localStorage.setItem(PRO_MODE_KEY, next ? '1' : '0');
    } catch {
      console.warn('[UserMode] failed to persist PRO mode');
    }
  }, []);

  // Per-user contributions — re-hydrate when the userId resolves or changes.
  const [contributions, setContributions] = useState<Contribution[]>(() => loadContributions(userId));
  useEffect(() => {
    setContributions(loadContributions(userId));
    // Also reset the bank selection when the user changes — protects against
    // cross-user stickiness if two demo users share a browser.
    setSelectedBanks([]);
    setRedactionOn(true);
  }, [userId]);

  // Re-arm redaction whenever the bank selection changes. Treats each bank
  // selection as its own viewing session: even if the user disabled redaction
  // on one set of banks, changing the selection starts masked again. The
  // password gate must be cleared again to view raw values.
  const selectedBanksKey = selectedBanks.map((b) => b.swift).join('|');
  useEffect(() => {
    setRedactionOn(true);
  }, [selectedBanksKey]);

  const [customTags, setCustomTags] = useState<CustomTag[]>(() => loadCustomTags());

  const addContribution = useCallback((c: Contribution) => {
    setContributions((prev) => {
      // Replace any existing contribution for this transaction — the user's
      // latest choice wins. Keeps "My Contributions" from ballooning with
      // stale entries when the user re-edits the same row.
      const next = prev.filter((p) => p.transactionId !== c.transactionId).concat(c);
      saveContributions(userId, next);
      return next;
    });
  }, [userId]);

  const revertContribution = useCallback((transactionId: string) => {
    setContributions((prev) => {
      const next = prev.filter((p) => p.transactionId !== transactionId);
      saveContributions(userId, next);
      return next;
    });
  }, [userId]);

  const addCustomTag = useCallback((tag: CustomTag) => {
    setCustomTags((prev) => {
      // Dedupe by tag name. A user re-creating the same tag against a new
      // set of groups merges the groups rather than producing a duplicate.
      const idx = prev.findIndex((p) => p.name === tag.name);
      if (idx === -1) {
        const next = prev.concat(tag);
        saveCustomTags(next);
        return next;
      }
      const merged = new Set([...prev[idx].groups, ...tag.groups]);
      const next = [...prev];
      next[idx] = { ...prev[idx], groups: Array.from(merged) };
      saveCustomTags(next);
      return next;
    });
  }, []);

  const value = useMemo<UserModeContextValue>(() => ({
    selectedBanks,
    setSelectedBanks,
    proMode,
    setProMode,
    redactionOn,
    setRedactionOn,
    contributions,
    addContribution,
    revertContribution,
    customTags,
    addCustomTag,
  }), [selectedBanks, proMode, setProMode, redactionOn, contributions, addContribution, revertContribution, customTags, addCustomTag]);

  return <UserModeContext.Provider value={value}>{children}</UserModeContext.Provider>;
}

export function useUserMode(): UserModeContextValue {
  const ctx = useContext(UserModeContext);
  if (!ctx) throw new Error('useUserMode must be used within a UserModeProvider');
  return ctx;
}
