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
  ExtractionOperation,
} from '../types';
import { getContextValue } from '../types/tagSpec';
import { decomposeRegex, decomposeExtractionRegex } from '../utils/engregxify';
import {
  regexify,
  regexifyExtraction,
  generateExpressionPrompt,
  generateExtractionPrompt,
} from '../utils/regexify';
import { generateId, generateExpressionId } from '../utils/uuid';

function fromExistingDefinition(
  def: TagSpecDefinition,
  parentLib?: TagSpecLibrary
): WizardFormState {
  return {
    tag: def.Tag,
    side: parentLib ? (getContextValue(parentLib.Context, 'Side') ?? 'CR') : 'CR',
    bankSwiftCode: parentLib ? (getContextValue(parentLib.Context, 'BankSwiftCode') ?? '') : '',
    transactionTypeCode: getContextValue(def.Context, 'TransactionTypeCode') ?? '',
    statusTag: def.StatusTag,
    certaintyLevelTag: def.CertaintyLevelTag,
    validity: { ...def.Validity },
    ruleGroups: def.TagRuleExpressions.map((andGroup) => ({
      id: crypto.randomUUID(),
      conditions: andGroup.map((expr) => {
        const decomposed = decomposeRegex(expr.Regex);
        return {
          id: crypto.randomUUID(),
          sourceField: expr.SourceField,
          operation: decomposed.operation,
          value: decomposed.value,
          values: decomposed.values,
          prefix: decomposed.prefix,
          suffix: decomposed.suffix,
        };
      }),
    })),
    attributes: def.Attributes.map((attr) => {
      const decomposed = decomposeExtractionRegex(attr.AttributeRuleExpression.Regex);
      return {
        id: crypto.randomUUID(),
        attributeTag: attr.AttributeTag,
        isMandatory: attr.IsMandatory,
        validationRuleTag: attr.ValidationRuleTag,
        sourceField: attr.AttributeRuleExpression.SourceField,
        extractionOperation: attr.AttributeRuleExpression.VerifyValue
          ? ('extract_between_and_verify' as ExtractionOperation)
          : decomposed.operation,
        prefix: decomposed.prefix,
        suffix: decomposed.suffix,
        pattern: decomposed.pattern,
        verifyValue: attr.AttributeRuleExpression.VerifyValue,
      };
    }),
  };
}

export interface WizardFormResult {
  parentContext: ContextEntry[];
  definition: TagSpecDefinition;
}

export function useWizardForm(
  existingDef?: TagSpecDefinition,
  initialFormState?: WizardFormState,
  defaultSourceField: string = 'Field86',
  parentLib?: TagSpecLibrary,
  initialStep?: WizardStep,
) {
  function createEmptyCondition(): ConditionFormValue {
    return {
      id: crypto.randomUUID(),
      sourceField: defaultSourceField,
      operation: 'begins_with',
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
      validationRuleTag: 'STRING',
      sourceField: defaultSourceField,
      extractionOperation: 'predefined:ksa_iban',
      prefix: '',
      suffix: '',
    };
  }

  function createInitialState(): WizardFormState {
    return {
      tag: '',
      side: 'CR',
      bankSwiftCode: 'ARNBSARI',
      transactionTypeCode: 'TRF',
      statusTag: 'ACTIVE',
      certaintyLevelTag: 'HIGH',
      validity: {
        StartDate: new Date().toISOString().split('T')[0],
        EndDate: null,
      },
      ruleGroups: [],
      attributes: [],
    };
  }

  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep ?? 1);
  const [formState, setFormState] = useState<WizardFormState>(
    existingDef
      ? fromExistingDefinition(existingDef, parentLib)
      : initialFormState
      ? { ...initialFormState }
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
        attributes: prev.attributes.map((a) =>
          a.id === attrId ? { ...a, ...updates } : a
        ),
      }));
    },
    []
  );

  // --- Convert form state to TagSpecDefinition + parentContext ---
  const toTagSpecDefinition = useCallback((): WizardFormResult => {
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
      Validity: formState.validity,
      TagRuleExpressions: formState.ruleGroups.map((group) =>
        group.conditions.map((c) => {
          const prompt = generateExpressionPrompt(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          });
          return {
            SourceField: c.sourceField,
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify(c.operation, c.value, c.values, {
              prefix: c.prefix,
              suffix: c.suffix,
            }),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          };
        })
      ),
      Attributes: formState.attributes.map((attr, index) => {
        const prompt = generateExtractionPrompt(attr.extractionOperation, {
          prefix: attr.prefix,
          suffix: attr.suffix,
          pattern: attr.pattern,
          verifyValue: attr.verifyValue,
        });
        return {
          AttributeTag: attr.attributeTag,
          IsMandatory: attr.isMandatory,
          LOVTag: null,
          ValidationRuleTag: attr.validationRuleTag,
          AttributeRuleExpression: {
            SourceField: attr.sourceField,
            ExpressionPrompt: null,
            ExpressionId: generateExpressionId(id, 'attr', index),
            Regex: regexifyExtraction(attr.extractionOperation, {
              prefix: attr.prefix,
              suffix: attr.suffix,
              pattern: attr.pattern,
              verifyValue: attr.verifyValue,
            }),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
            ...(attr.verifyValue ? { VerifyValue: attr.verifyValue } : {}),
          },
        };
      }),
    };

    return { parentContext, definition };
  }, [formState, existingDef]);

  return {
    currentStep,
    formState,
    isEditing,
    goNext,
    goBack,
    goToStep,
    resetForm,
    updateBasicInfo,
    addRuleGroup,
    removeRuleGroup,
    addCondition,
    removeCondition,
    updateCondition,
    addAttribute,
    removeAttribute,
    updateAttribute,
    toTagSpecDefinition,
  };
}
