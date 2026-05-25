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
    _originalRegex: def.Attributes[i].AttributeRuleExpression.Regex || undefined,
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
  return {
    tag: def.Tag,
    side: parentLib ? (getContextValue(parentLib.Context, 'Side') ?? 'CR') : 'CR',
    bankSwiftCode: parentLib ? (getContextValue(parentLib.Context, 'BankSwiftCode') ?? '') : '',
    transactionTypeCode: getContextValue(def.Context, 'TransactionTypeCode') ?? '',
    statusTag: def.StatusTag,
    certaintyLevelTag: def.CertaintyLevelTag,
    validity: { ...def.Validity },
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
      transformations: [],
    };
  }

  function createInitialState(): WizardFormState {
    return {
      tag: '',
      side: 'CR',
      bankSwiftCode: 'ARNBSARI',
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

    const parentContext: ContextEntry[] = [
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
        StartDate: formState.validity.StartDate || null,
        EndDate: formState.validity.EndDate || null,
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
    removeCondition,
    updateCondition,
    addAttribute,
    removeAttribute,
    updateAttribute,
    reorderAttributes,
    applyTemplate,
    toTagSpecDefinition,
  };
}
