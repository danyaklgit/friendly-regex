import { useState, useCallback, useEffect } from 'react';
import type { TagSpecLibrary, TagSpecDefinition } from '../types';
import { getRegexDescription } from '../types/tagSpec';
import { identityKeySuffix, hasCompleteIdentity, type IdentityInput } from '../utils/libraryIdentity';

const BASELINE_PREFIX = 'tep:baseline:';
const CURRENT_PREFIX = 'tep:current:';

// Keys are namespaced by identity so a checked-out MT942 draft for a bank/side
// never collides with the MT940 draft for the SAME bank/side, and a Ledger
// draft (keyed by ClientCode/ErpCode) never collides with any of them. The
// suffix is built centrally in libraryIdentity.identityKeySuffix.
function key(prefix: string, identity: IdentityInput) {
  return `${prefix}${identityKeySuffix(identity)}`;
}

function readLib(storageKey: string): TagSpecLibrary | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as TagSpecLibrary;
  } catch {
    return null;
  }
}

// --- Change summary types and diffing ---

export interface DefinitionChange {
  tag: string;
  type: 'added' | 'removed' | 'modified';
  details: string[];
}

export interface ChangeSummary {
  changes: DefinitionChange[];
}

function describeExpr(expr: TagSpecDefinition['TagRuleExpressions'][number][number]): string {
  const desc = getRegexDescription(expr.RegexDetails);
  return desc || `${expr.SourceField}: ${expr.Regex}`;
}

function describeRuleGroup(group: TagSpecDefinition['TagRuleExpressions'][number]): string {
  return group.map(describeExpr).join(' AND ');
}

function diffRuleGroups(
  baseGroups: TagSpecDefinition['TagRuleExpressions'],
  currGroups: TagSpecDefinition['TagRuleExpressions'],
): string[] {
  const details: string[] = [];
  const maxLen = Math.max(baseGroups.length, currGroups.length);

  for (let i = 0; i < maxLen; i++) {
    const baseGroup = baseGroups[i];
    const currGroup = currGroups[i];
    const groupLabel = maxLen === 1 ? 'Rule' : `Rule ${i + 1}`;

    if (!baseGroup && currGroup) {
      details.push(`${groupLabel} added: ${describeRuleGroup(currGroup)}`);
      continue;
    }
    if (baseGroup && !currGroup) {
      details.push(`${groupLabel} removed: ${describeRuleGroup(baseGroup)}`);
      continue;
    }

    // Both exist — compare expressions within the group
    if (JSON.stringify(baseGroup) === JSON.stringify(currGroup)) continue;

    const maxExprLen = Math.max(baseGroup.length, currGroup.length);
    for (let j = 0; j < maxExprLen; j++) {
      const baseExpr = baseGroup[j];
      const currExpr = currGroup[j];

      if (!baseExpr && currExpr) {
        details.push(`${groupLabel}: Added condition "${describeExpr(currExpr)}"`);
        continue;
      }
      if (baseExpr && !currExpr) {
        details.push(`${groupLabel}: Removed condition "${describeExpr(baseExpr)}"`);
        continue;
      }
      if (JSON.stringify(baseExpr) === JSON.stringify(currExpr)) continue;

      const baseDesc = describeExpr(baseExpr);
      const currDesc = describeExpr(currExpr);
      if (baseDesc !== currDesc) {
        details.push(`${groupLabel}: "${baseDesc}" \u2192 "${currDesc}"`);
      } else if (baseExpr.SourceField !== currExpr.SourceField) {
        details.push(`${groupLabel}: Field changed from ${baseExpr.SourceField} to ${currExpr.SourceField}`);
      } else if (baseExpr.Regex !== currExpr.Regex) {
        details.push(`${groupLabel}: Pattern updated`);
      }
    }
  }

  return details;
}

/** Normalize a TagAttribute to a canonical string for comparison, ignoring property order */
function normalizeAttr(attr: TagSpecDefinition['Attributes'][number]): string {
  const rule = attr.AttributeRuleExpression;
  return JSON.stringify({
    AttributeTag: attr.AttributeTag,
    IsMandatory: attr.IsMandatory,
    LOVTag: attr.LOVTag ?? null,
    ValidationRuleTag: attr.ValidationRuleTag,
    SourceField: rule?.SourceField ?? '',
    Regex: rule?.Regex ?? '',
    RegexDetails: rule?.RegexDetails ?? [],
  });
}

function diffAttributes(
  baseAttrs: TagSpecDefinition['Attributes'],
  currAttrs: TagSpecDefinition['Attributes'],
): string[] {
  const details: string[] = [];
  const baseByTag = new Map(baseAttrs.map((a) => [a.AttributeTag, a]));
  const currByTag = new Map(currAttrs.map((a) => [a.AttributeTag, a]));

  const removed = [...baseByTag.keys()].filter((t) => !currByTag.has(t));
  const added = [...currByTag.keys()].filter((t) => !baseByTag.has(t));
  const modified = [...currByTag.keys()].filter((t) => {
    const base = baseByTag.get(t);
    const curr = currByTag.get(t);
    if (!base || !curr) return false;
    return normalizeAttr(base) !== normalizeAttr(curr);
  });

  if (removed.length > 0) details.push(`Attributes removed: ${removed.join(', ')}`);
  if (added.length > 0) details.push(`Attributes added: ${added.join(', ')}`);
  if (modified.length > 0) details.push(`Attributes modified: ${modified.join(', ')}`);

  return details;
}

export function diffDefinition(baseline: TagSpecDefinition, current: TagSpecDefinition): string[] {
  const details: string[] = [];

  // Tag name change
  if (baseline.Tag !== current.Tag) {
    details.push(`Tag: ${baseline.Tag} \u2192 ${current.Tag}`);
  }

  // Status change
  if (baseline.StatusTag !== current.StatusTag) {
    details.push(`Status: ${baseline.StatusTag} \u2192 ${current.StatusTag}`);
  }

  // Certainty change
  if (baseline.CertaintyLevelTag !== current.CertaintyLevelTag) {
    details.push(`Certainty: ${baseline.CertaintyLevelTag} \u2192 ${current.CertaintyLevelTag}`);
  }

  // Rules diff — match by index for accurate change detection
  if (JSON.stringify(baseline.TagRuleExpressions) !== JSON.stringify(current.TagRuleExpressions)) {
    details.push(...diffRuleGroups(baseline.TagRuleExpressions, current.TagRuleExpressions));
  }

  // Attributes diff — normalized to avoid false positives from property ordering
  details.push(...diffAttributes(baseline.Attributes, current.Attributes));

  return details;
}

function computeChangeSummary(baselineLib: TagSpecLibrary, currentLib: TagSpecLibrary): ChangeSummary {
  const baseDefs = baselineLib.TagSpecDefinitions;
  const currDefs = currentLib.TagSpecDefinitions;

  const baseById = new Map(baseDefs.map((d) => [d.Id, d]));
  const currById = new Map(currDefs.map((d) => [d.Id, d]));

  const changes: DefinitionChange[] = [];

  // Removed definitions
  for (const [id, def] of baseById) {
    if (!currById.has(id)) {
      changes.push({ tag: def.Tag, type: 'removed', details: [] });
    }
  }

  // Added definitions
  for (const [id, def] of currById) {
    if (!baseById.has(id)) {
      changes.push({ tag: def.Tag, type: 'added', details: [] });
    }
  }

  // Modified definitions
  for (const [id, currDef] of currById) {
    const baseDef = baseById.get(id);
    if (!baseDef) continue;
    if (JSON.stringify(baseDef) === JSON.stringify(currDef)) continue;
    const details = diffDefinition(baseDef, currDef);
    changes.push({ tag: currDef.Tag, type: 'modified', details });
  }

  return { changes };
}

// --- Hook ---

export function useLocalChanges(identity: IdentityInput | null | undefined) {
  const [hasChanges, setHasChanges] = useState(false);

  const suffix = identity ? identityKeySuffix(identity) : '';
  const bound = identity && hasCompleteIdentity(identity) ? identity : null;

  // Recompute hasChanges whenever the bound identity changes or after updates.
  const recompute = useCallback(() => {
    if (!bound) { setHasChanges(false); return; }
    const baselineRaw = localStorage.getItem(key(BASELINE_PREFIX, bound));
    const currentRaw = localStorage.getItem(key(CURRENT_PREFIX, bound));
    if (!baselineRaw || !currentRaw) { setHasChanges(false); return; }
    setHasChanges(baselineRaw !== currentRaw);
    // `suffix` is the serialized identity — recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suffix]);

  useEffect(() => { recompute(); }, [recompute]);

  const saveBaseline = useCallback((lib: TagSpecLibrary) => {
    if (!bound) return;
    const serialized = JSON.stringify(lib);
    localStorage.setItem(key(BASELINE_PREFIX, bound), serialized);
    localStorage.setItem(key(CURRENT_PREFIX, bound), serialized);
    setHasChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suffix]);

  const updateCurrent = useCallback((lib: TagSpecLibrary) => {
    if (!bound) return;
    localStorage.setItem(key(CURRENT_PREFIX, bound), JSON.stringify(lib));
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suffix, recompute]);

  const clearChanges = useCallback((target: IdentityInput) => {
    localStorage.removeItem(key(BASELINE_PREFIX, target));
    localStorage.removeItem(key(CURRENT_PREFIX, target));
    if (identityKeySuffix(target) === suffix) setHasChanges(false);
  }, [suffix]);

  const getLocalLib = useCallback((target: IdentityInput): TagSpecLibrary | null => {
    return readLib(key(CURRENT_PREFIX, target));
  }, []);

  /**
   * True when a persisted draft exists for `target` and differs from its
   * baseline — i.e. there are local edits the server may not have yet.
   * Unlike the bound `hasChanges` state, this checks ANY identity, so
   * Check-In / Release handlers (which can act on rows other than the active
   * checkout) can decide whether a pre-save is needed at all: with no local
   * changes the server already holds the newest list (the wizard saves on
   * every change), and re-sending a possibly stale in-memory copy can only
   * lose data, never add it.
   */
  const hasChangesFor = useCallback((target: IdentityInput): boolean => {
    const currentRaw = localStorage.getItem(key(CURRENT_PREFIX, target));
    if (!currentRaw) return false;
    const baselineRaw = localStorage.getItem(key(BASELINE_PREFIX, target));
    if (!baselineRaw) return true; // draft with no anchor — assume dirty
    return baselineRaw !== currentRaw;
  }, []);

  const hasLocalData = useCallback((target: IdentityInput): boolean => {
    return localStorage.getItem(key(CURRENT_PREFIX, target)) !== null;
  }, []);

  const getChangeSummary = useCallback((target: IdentityInput): ChangeSummary | null => {
    const baselineLib = readLib(key(BASELINE_PREFIX, target));
    const currentLib = readLib(key(CURRENT_PREFIX, target));
    if (!baselineLib || !currentLib) return null;
    return computeChangeSummary(baselineLib, currentLib);
  }, []);

  return { hasChanges, hasChangesFor, saveBaseline, updateCurrent, clearChanges, getLocalLib, hasLocalData, getChangeSummary };
}
