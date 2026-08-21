import { useState, useCallback } from 'react';
import type {
  TagSpecDefinition,
  TagSpecLibrary,
  ContextEntry,
  WizardFormState,
  WizardStep,
  AndGroupFormValue,
  ConditionFormValue,
  AttributeFormValue,
} from '../types';
import type { ExtractionMethodDef } from '../types/lov';
import type { TagSpecCommentTarget } from '../types/comments';
import { WIZARD_DEFINITION_FORM_KEY } from '../context/WizardCommentDraftsContext';
import { getContextValue } from '../types/tagSpec';
import {
  regexify,
  regexifyExtraction,
  generateExpressionPrompt,
  generateExtractionPrompt,
} from '../utils/regexify';
import { generateId, generateExpressionId } from '../utils/uuid';
import { cloneRulesAndAttributesFrom } from '../utils/cloneRulesAndAttributes';
import { computeExclusionConditions, type ExclusionResult } from '../utils/computeExclusionConditions';
import { DEFAULT_DATA_SET_TYPE } from '../constants/dataSetTypes';
import { isLedger, identityFromContext } from '../utils/libraryIdentity';

/**
 * Sentinel value the backend ships on `Validity.StartDate` to mean "no
 * validity start" — every rule in the live GetTagSpecLibraries snapshot
 * carries this exact string when the operator hasn't set a real start
 * date. Treating it as a literal date would surface "12/31/2025" in the
 * Basic Info Validity section for rules that the operator believes have
 * no validity, and would also fire the per-picker × clear button. We
 * normalize it to `null` on read so the form state matches operator
 * intent; the existing `tagSpecLibrarySave` sanitizer already accepts
 * null on write and the backend re-defaults to the sentinel server-side.
 *
 * Extend this list if additional backend defaults surface (e.g. an
 * EndDate sentinel). Exact-match only — bare dates like "2025-12-31"
 * (no time portion) are real operator-set values and must pass through.
 */
const VALIDITY_NO_BOUND_SENTINELS: ReadonlySet<string> = new Set([
  '2025-12-31T22:00:00Z',
]);

function normalizeValidityBound(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (VALIDITY_NO_BOUND_SENTINELS.has(raw)) return null;
  return raw;
}

/**
 * Promote a bare `YYYY-MM-DD` date (what `<input type="date">` writes
 * into form state) to the full ISO datetime shape the backend stores
 * Validity bounds in — `YYYY-MM-DDT00:00:00Z`. Without this lift, the
 * tagging engine receives a value it can't reconcile with the
 * `"2025-12-31T22:00:00Z"`-shaped baseline, treats the rule as having
 * no usable validity start, and leaves matching rows untagged after
 * check-in. Values that already carry a `T` portion (operator pasted a
 * datetime, or we round-tripped a backend value) pass through
 * unchanged. Null / empty becomes null so the existing sanitizer keeps
 * collapsing "unset" to null on the wire.
 */
function serializeValidityBound(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.includes('T')) return raw;
  return `${raw}T00:00:00Z`;
}

export function fromExistingDefinition(
  def: TagSpecDefinition,
  parentLib?: TagSpecLibrary,
  lovExtractions: ExtractionMethodDef[] = [],
): WizardFormState {
  const { ruleGroups, attributes } = cloneRulesAndAttributesFrom(def, lovExtractions);
  // In edit mode, preserve the backend's original regex on each attribute. The
  // shared helper drops _originalRegex (intentional for the template case);
  // re-attach it here so live previews don't fall back to lossy round-trips.
  const attributesWithOriginalRegex: AttributeFormValue[] = attributes.map((attr, i) => ({
    ...attr,
    // Constant-mode attributes have no AttributeRuleExpression on the wire;
    // optional chain so the load doesn't crash on them.
    _originalRegex: def.Attributes[i].AttributeRuleExpression?.Regex || undefined,
  }));
  // Re-inject the RuleExpression backend ids on each condition so the comments
  // feature can pinpoint a rule. Order is preserved by `cloneRulesAndAttributesFrom`.
  // Existing libraries persist `ExpressionId: null` for rule conditions (only
  // attributes get auto-generated ids today), so fall back to a deterministic
  // position-based id derived from the parent definition. Stable across reloads
  // for any rule whose position hasn't changed.
  const ruleGroupsWithIds = ruleGroups.map((g, gi) => ({
    ...g,
    conditions: g.conditions.map((c, ci) => ({
      ...c,
      _expressionId:
        def.TagRuleExpressions[gi]?.[ci]?.ExpressionId
        || (def.Id ? `${def.Id}-rule-${gi}-${ci}` : null),
    })),
  }));
  const parentIdentity = parentLib ? identityFromContext(parentLib) : null;
  return {
    tag: def.Tag,
    side: parentLib ? (getContextValue(parentLib.Context, 'Side') ?? 'CR') : 'CR',
    bankSwiftCode: parentLib ? (getContextValue(parentLib.Context, 'BankSwiftCode') ?? '') : '',
    dataSetType: parentLib?.DataSetType ?? DEFAULT_DATA_SET_TYPE,
    clientCode: parentIdentity?.clientCode ?? '',
    erpCode: parentIdentity?.erpCode ?? '',
    transactionTypeCode: getContextValue(def.Context, 'TransactionTypeCode') ?? '',
    statusTag: def.StatusTag,
    certaintyLevelTag: def.CertaintyLevelTag,
    validity: {
      StartDate: normalizeValidityBound(def.Validity.StartDate),
      EndDate: normalizeValidityBound(def.Validity.EndDate),
    },
    ruleGroups: ruleGroupsWithIds,
    attributes: attributesWithOriginalRegex,
  };
}

export interface WizardFormResult {
  parentContext: ContextEntry[];
  definition: TagSpecDefinition;
  /**
   * Maps wizard form-level UUIDs (`condition.id`, `attribute.id`) to the
   * `TagSpecCommentTarget` that row resolves to once the definition is saved.
   * Populated only when the caller passed a `libraryId` into
   * `toTagSpecDefinition` (i.e. the wizard is scoped to a real bank/side
   * checkout). Empty otherwise. Drafts whose form key is absent from this map
   * are dropped at flush time.
   */
  commentTargetByFormKey: Map<string, TagSpecCommentTarget>;
}

/**
 * Build the form-key to comment-target map. Exported separately so the same
 * id scheme can be reused in tests and from any future caller that wants to
 * pre-resolve targets without rebuilding the whole TagSpecDefinition.
 *
 * Rule id scheme matches the synthetic id used by the Backlog viewer
 * (`ConditionRow`) for legacy rules without a backend `ExpressionId`, so a
 * comment drafted in the wizard for a rule stays addressable from the same
 * Backlog row after save.
 */
export function buildCommentTargetByFormKey(
  formState: WizardFormState,
  libraryId: string,
  definitionId: string,
): Map<string, TagSpecCommentTarget> {
  const map = new Map<string, TagSpecCommentTarget>();
  // Tag-level (whole-definition) target. Lets drafts authored against the
  // TagSpec header (the wizard's Basic Info step or the Rule Builder's title
  // bar) resolve to a comment on the definition itself.
  map.set(WIZARD_DEFINITION_FORM_KEY, {
    TagSpecLibraryId: libraryId,
    TagSpecDefinitionId: definitionId,
  });
  formState.ruleGroups.forEach((group, gi) => {
    group.conditions.forEach((cond, ci) => {
      map.set(cond.id, {
        TagSpecLibraryId: libraryId,
        TagSpecDefinitionId: definitionId,
        TagRuleExpressionId: `${definitionId}-rule-${gi}-${ci}`,
      });
    });
  });
  formState.attributes.forEach((attr) => {
    const tag = attr.attributeTag?.trim();
    if (!tag) return;
    map.set(attr.id, {
      TagSpecLibraryId: libraryId,
      TagSpecDefinitionId: definitionId,
      AttributeTag: tag,
    });
  });
  return map;
}

export function useWizardForm(
  existingDef?: TagSpecDefinition,
  initialFormState?: WizardFormState,
  _defaultSourceField?: string,
  parentLib?: TagSpecLibrary,
  initialStep?: WizardStep,
  lovExtractions: ExtractionMethodDef[] = [],
) {
  function createEmptyCondition(): ConditionFormValue {
    return {
      id: crypto.randomUUID(),
      sourceField: '',
      operation: '' as ConditionFormValue['operation'],
      value: '',
    };
  }

  function createEmptyGroup(): AndGroupFormValue {
    return {
      id: crypto.randomUUID(),
      conditions: [createEmptyCondition()],
    };
  }

  function createEmptyAttribute(): AttributeFormValue {
    return {
      id: crypto.randomUUID(),
      attributeTag: '',
      isMandatory: false,
      validationRuleTag: '',
      sourceField: '',
      extractionOperation: '' as AttributeFormValue['extractionOperation'],
      prefix: '',
      suffix: '',
      lovTag: null,
      isLovBased: false,
      preExtractionTransformations: [],
      transformations: [],
    };
  }

  function createInitialState(): WizardFormState {
    return {
      tag: '',
      side: 'CR',
      bankSwiftCode: 'ARNBSARI',
      dataSetType: DEFAULT_DATA_SET_TYPE,
      clientCode: '',
      erpCode: '',
      transactionTypeCode: '',
      statusTag: 'ACTIVE',
      certaintyLevelTag: 'HIGH',
      validity: {
        StartDate: null,
        EndDate: null,
      },
      ruleGroups: [],
      attributes: [],
    };
  }

  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep ?? 1);
  const [formState, setFormState] = useState<WizardFormState>(
    initialFormState
      ? { ...initialFormState }
      : existingDef
      ? fromExistingDefinition(existingDef, parentLib, lovExtractions)
      : createInitialState()
  );

  const isEditing = !!existingDef;

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, 4) as WizardStep);
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1) as WizardStep);
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const resetForm = useCallback(() => {
    setFormState(createInitialState());
  }, []);

  // --- Basic info updates ---
  const updateBasicInfo = useCallback(
    (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => {
      setFormState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // --- Rule group operations ---
  const addRuleGroup = useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      ruleGroups: [...prev.ruleGroups, createEmptyGroup()],
    }));
  }, []);

  const removeRuleGroup = useCallback((groupId: string) => {
    setFormState((prev) => ({
      ...prev,
      ruleGroups: prev.ruleGroups.filter((g) => g.id !== groupId),
    }));
  }, []);

  // Duplicates the rule set at `groupId` and inserts the copy right after it
  // (so it renders as an OR sibling immediately below). Every id is regenerated
  // so the clone is independent — editing one no longer mutates the other.
  // The clone is collapsed by default by the caller's view, but its data is
  // marked as already-filled so it doesn't open in "new placeholder" mode.
  const cloneRuleGroup = useCallback((groupId: string) => {
    setFormState((prev) => {
      const idx = prev.ruleGroups.findIndex((g) => g.id === groupId);
      if (idx === -1) return prev;
      const source = prev.ruleGroups[idx];
      const cloned: AndGroupFormValue = {
        id: crypto.randomUUID(),
        conditions: source.conditions.map((c) => ({
          ...c,
          id: crypto.randomUUID(),
        })),
      };
      const next = [...prev.ruleGroups];
      next.splice(idx + 1, 0, cloned);
      return { ...prev, ruleGroups: next };
    });
  }, []);

  const addCondition = useCallback((groupId: string) => {
    setFormState((prev) => ({
      ...prev,
      ruleGroups: prev.ruleGroups.map((g) =>
        g.id === groupId
          ? { ...g, conditions: [...g.conditions, createEmptyCondition()] }
          : g
      ),
    }));
  }, []);

  // Append a fully-formed condition (field + operation + value) to the LAST
  // rule set, creating a first rule set if none exist. Powers the transactions
  // table's right-click "Add as matching rule =/contains" — the cell's field
  // and value become an AND condition in the rule being authored.
  const appendCondition = useCallback(
    (sourceField: string, operation: ConditionFormValue['operation'], value: string) => {
      setFormState((prev) => {
        const condition: ConditionFormValue = {
          id: crypto.randomUUID(),
          sourceField,
          operation,
          value,
        };
        if (prev.ruleGroups.length === 0) {
          return { ...prev, ruleGroups: [{ id: crypto.randomUUID(), conditions: [condition] }] };
        }
        const lastIdx = prev.ruleGroups.length - 1;
        return {
          ...prev,
          ruleGroups: prev.ruleGroups.map((g, i) => {
            if (i !== lastIdx) return g;
            // Drop unfilled placeholder rows (a freshly "Add Rule Set" group
            // carries one empty condition) so the appended condition replaces
            // it instead of leaving a dangling empty row.
            const kept = g.conditions.filter((c) => c.sourceField.trim().length > 0);
            return { ...g, conditions: [...kept, condition] };
          }),
        };
      });
    },
    [],
  );

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setFormState((prev) => ({
      ...prev,
      ruleGroups: prev.ruleGroups.map((g) =>
        g.id === groupId
          ? { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) }
          : g
      ),
    }));
  }, []);

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, updates: Partial<ConditionFormValue>) => {
      setFormState((prev) => ({
        ...prev,
        ruleGroups: prev.ruleGroups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                conditions: g.conditions.map((c) =>
                  c.id === conditionId ? { ...c, ...updates } : c
                ),
              }
            : g
        ),
      }));
    },
    []
  );

  // Smart exclusion: take another tag's saved rule expressions, compute
  // the conditions that differentiate it from the current draft, and
  // append their negations to every AND group of the draft so the draft
  // no longer matches the same rows the target tag matches.
  //
  // See `computeExclusionConditions` for the differentiator algorithm
  // and the operation-by-operation negation table. The mutation is
  // batched into a single `setFormState` call so consumers see one
  // coherent update (the rule list jumps from N conditions to N + M in
  // one render, not in M sequential commits).
  //
  // Returns a structured result so the caller (the UI button handler)
  // can produce a meaningful toast: how many conditions were added,
  // whether the action was skipped, and why.
  const excludeTag = useCallback((targetDef: TagSpecDefinition): ExclusionResult => {
    // Compute against a snapshot of the current ruleGroups. Reading
    // from React state here is safe because the operator can only
    // click Exclude once between renders, and we batch the mutation
    // inside setFormState below.
    let result: ExclusionResult = { conditions: [], skipped: true };
    setFormState((prev) => {
      result = computeExclusionConditions(prev.ruleGroups, targetDef);
      if (result.skipped || result.conditions.length === 0) return prev;
      // Append negated conditions to every existing AND group. When
      // the operator hasn't authored any rules yet, create a single
      // new group that holds them all — without this, the exclusion
      // would have nothing to attach to and silently drop the work.
      const groupsToWrite: AndGroupFormValue[] = prev.ruleGroups.length > 0
        ? prev.ruleGroups
        : [{ id: crypto.randomUUID(), conditions: [] }];
      const nextGroups: AndGroupFormValue[] = groupsToWrite.map((g) => ({
        ...g,
        conditions: [
          ...g.conditions,
          // Fresh ids per AndGroup so the same logical "does not
          // contain REF" can sit independently in every group
          // without identity collisions.
          ...result.conditions.map((c) => ({ ...c, id: crypto.randomUUID() })),
        ],
      }));
      return { ...prev, ruleGroups: nextGroups };
    });
    return result;
  }, []);

  // --- Attribute operations ---
  const addAttribute = useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      attributes: [...prev.attributes, createEmptyAttribute()],
    }));
  }, []);

  // Replace the full attributes array. Used by the drag-and-drop / arrow
  // reorder controls in StepAttributes — the save pipeline already preserves
  // order via `formState.attributes.map((attr, index) => ...)` at line 328.
  const reorderAttributes = useCallback((newAttributes: AttributeFormValue[]) => {
    setFormState((prev) => ({ ...prev, attributes: newAttributes }));
  }, []);

  const removeAttribute = useCallback((attrId: string) => {
    setFormState((prev) => ({
      ...prev,
      attributes: prev.attributes.filter((a) => a.id !== attrId),
    }));
  }, []);

  // Duplicates the attribute at `attrId` and inserts the copy right after
  // it. Mirrors `cloneRuleGroup` for rule sets — every id is regenerated
  // so the clone is independent, and the transformations array is
  // deep-copied so editing one no longer mutates the other.
  //
  // `attributeTag` is deliberately cleared on the clone so the operator
  // picks a name before saving. This also lets AttributeEditor's mount
  // gates kick in (empty name => starts expanded, not "saved" yet) so the
  // cloned row opens in edit mode with all other fields pre-populated for
  // tweaking — same UX as the rule-set clone.
  const cloneAttribute = useCallback((attrId: string) => {
    setFormState((prev) => {
      const idx = prev.attributes.findIndex((a) => a.id === attrId);
      if (idx === -1) return prev;
      const source = prev.attributes[idx];
      const cloned: AttributeFormValue = {
        ...source,
        id: crypto.randomUUID(),
        attributeTag: '',
        transformations: (source.transformations ?? []).map((t) => ({ ...t })),
      };
      const next = [...prev.attributes];
      next.splice(idx + 1, 0, cloned);
      return { ...prev, attributes: next };
    });
  }, []);

  const updateAttribute = useCallback(
    (attrId: string, updates: Partial<AttributeFormValue>) => {
      setFormState((prev) => ({
        ...prev,
        attributes: prev.attributes.map((a) => {
          if (a.id !== attrId) return a;
          // _originalRegex captures the backend's stored regex on load. For
          // operations whose form-state round-trip is lossy (e.g. extract_after
          // with prefix '^'), the rebuilt regex won't match the source field
          // and live previews silently fall back to server values without the
          // draft's transformations. Keep _originalRegex when the user edits
          // anything OTHER than extraction (e.g. just adds a transformation),
          // and clear it as soon as they touch any extraction parameter so
          // genuine extraction edits do preview.
          const extractionFields: (keyof AttributeFormValue)[] = [
            'sourceField', 'extractionOperation', 'prefix', 'suffix', 'pattern',
            'numChars', 'toStr', 'toStart', 'occurrence', 'startingPosition',
            'fromPosition', 'prefixOccurrence', 'suffixOccurrence', 'verifyValue',
            'suffixOrEndOfInput', 'tillEndOfInput',
            // Toggling into/out of constant mode (or editing the constant
            // value) replaces the whole extraction story — drop _originalRegex
            // so live previews don't fall back to a stale stored regex.
            'isConstant', 'constantValue',
          ];
          const extractionChanged = extractionFields.some((f) => f in updates);
          return extractionChanged
            ? { ...a, ...updates, _originalRegex: undefined }
            : { ...a, ...updates };
        }),
      }));
    },
    []
  );

  // --- Template application ---
  const applyTemplate = useCallback((def: TagSpecDefinition) => {
    setFormState((prev) => ({
      ...prev,
      ...cloneRulesAndAttributesFrom(def, lovExtractions),
    }));
  }, [lovExtractions]);

  // --- Convert form state to TagSpecDefinition + parentContext ---
  // `libraryId` is the parent TagSpecLibrary id. Optional because some callers
  // (test fixtures, builder previews) don't have a library scope; when omitted
  // the returned `commentTargetByFormKey` map is empty.
  const toTagSpecDefinition = useCallback((libraryId?: string | null): WizardFormResult => {
    const id = existingDef?.Id ?? generateId();

    // Ledger libraries are identified by (ClientCode, ErpCode); every other
    // type by (Side, BankSwiftCode). Side can still be a rule condition for
    // Ledger, it is just not the library key.
    const parentContext: ContextEntry[] = isLedger(formState.dataSetType)
      ? [
          { Key: 'ClientCode', Value: formState.clientCode },
          { Key: 'ErpCode', Value: formState.erpCode },
        ]
      : [
          { Key: 'Side', Value: formState.side },
          { Key: 'BankSwiftCode', Value: formState.bankSwiftCode },
        ];

    const childContext: ContextEntry[] = formState.transactionTypeCode
      ? [{ Key: 'TransactionTypeCode', Value: formState.transactionTypeCode }]
      : [];

    const definition: TagSpecDefinition = {
      Id: id,
      Tag: formState.tag,
      Context: childContext,
      StatusTag: formState.statusTag,
      CertaintyLevelTag: formState.certaintyLevelTag,
      Validity: {
        // Lift bare YYYY-MM-DD dates to full ISO datetimes (see
        // serializeValidityBound). The tagging engine compares stored
        // validity bounds against transaction date timestamps
        // (StatementDate; PostingDate on Ledger model V2 rows);
        // shipping the date without a time portion was the regression
        // that left rows untagged after check-in.
        StartDate: serializeValidityBound(formState.validity.StartDate),
        EndDate: serializeValidityBound(formState.validity.EndDate),
      },
      TagRuleExpressions: formState.ruleGroups.map((group) =>
        group.conditions.map((c) => {
          const prompt = generateExpressionPrompt(c.operation, c.value, c.values);
          return {
            SourceField: c.sourceField,
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify(c.operation, c.value, c.values),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          };
        })
      ),
      Attributes: formState.attributes.map((attr, index) => {
        // Constant-mode attribute: emit `Constant` as a literal, with the
        // extraction expression / transformations / LOV / validation slots
        // all null per the backend contract. No regex, no prompt, no
        // transformation pipeline applies.
        if (attr.isConstant) {
          return {
            AttributeTag: attr.attributeTag,
            IsMandatory: attr.isMandatory,
            LOVTag: null,
            ValidationRuleTag: '',
            Constant: attr.constantValue ?? '',
            AttributeRuleExpression: null,
            PreExtractionTransformations: null,
            Transformations: null,
          };
        }
        const extractionParams = {
          prefix: attr.prefix,
          suffix: attr.suffix,
          pattern: attr.pattern,
          verifyValue: attr.verifyValue,
          numChars: attr.numChars,
          toStr: attr.toStr,
          toStart: attr.toStart,
          occurrence: attr.occurrence,
          startingPosition: attr.startingPosition,
          fromPosition: attr.fromPosition,
          prefixOccurrence: attr.prefixOccurrence,
          suffixOccurrence: attr.suffixOccurrence,
          suffixOrEndOfInput: attr.suffixOrEndOfInput,
        };
        const prompt = generateExtractionPrompt(attr.extractionOperation, extractionParams);
        // Prefer the backend's original regex when the user hasn't edited
        // extraction (updateAttribute clears _originalRegex on any extraction
        // change). Avoids a no-op edit silently overwriting a backend regex
        // whose form-state round-trip is lossy (e.g. extract_after '^').
        const regex = attr._originalRegex ?? regexifyExtraction(attr.extractionOperation, extractionParams);
        return {
          AttributeTag: attr.attributeTag,
          IsMandatory: attr.isMandatory,
          LOVTag: attr.isLovBased ? (attr.lovTag ?? null) : null,
          ValidationRuleTag: attr.validationRuleTag,
          AttributeRuleExpression: {
            SourceField: attr.sourceField,
            ExpressionPrompt: null,
            ExpressionId: generateExpressionId(id, 'attr', index),
            Regex: regex,
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
            ...(attr.verifyValue ? { VerifyValue: attr.verifyValue } : {}),
          },
          // Conditional spread: omit the key entirely when the list is
          // empty so legacy attributes don't grow an empty array on the
          // wire. Same pattern as the post-extraction Transformations
          // below. The backend treats a missing field as "no pre-
          // extraction pipeline" (the schema doc comment is explicit
          // about backwards-compatibility on this).
          ...((attr.preExtractionTransformations && attr.preExtractionTransformations.length > 0)
            ? {
                PreExtractionTransformations: attr.preExtractionTransformations.map((t) => ({
                  Method: t.method,
                  Args: Object.entries(t.args).map(([k, v]) => ({ Key: k, Value: v })),
                })),
              }
            : {}),
          ...((attr.transformations && attr.transformations.length > 0)
            ? {
                Transformations: attr.transformations.map((t) => ({
                  Method: t.method,
                  Args: Object.entries(t.args).map(([k, v]) => ({ Key: k, Value: v })),
                })),
              }
            : {}),
        };
      }),
    };

    const commentTargetByFormKey = libraryId
      ? buildCommentTargetByFormKey(formState, libraryId, id)
      : new Map<string, TagSpecCommentTarget>();

    return { parentContext, definition, commentTargetByFormKey };
  }, [formState, existingDef]);

  return {
    currentStep,
    formState,
    setFormState,
    isEditing,
    goNext,
    goBack,
    goToStep,
    resetForm,
    updateBasicInfo,
    addRuleGroup,
    removeRuleGroup,
    cloneRuleGroup,
    addCondition,
    appendCondition,
    removeCondition,
    updateCondition,
    excludeTag,
    addAttribute,
    removeAttribute,
    cloneAttribute,
    updateAttribute,
    reorderAttributes,
    applyTemplate,
    toTagSpecDefinition,
  };
}
