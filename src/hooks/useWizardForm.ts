import { useState, useCallback } from 'react';
import type {
  TagSpecDefinition,
  WizardFormState,
  WizardStep,
  AndGroupFormValue,
  ConditionFormValue,
  AttributeFormValue,
} from '../types';
import { decomposeRegex, decomposeExtractionRegex } from '../utils/engregxify';
import {
  regexify,
  regexifyExtraction,
  generateExpressionPrompt,
  generateExtractionPrompt,
} from '../utils/regexify';
import { generateId, generateExpressionId } from '../utils/uuid';

function fromExistingDefinition(def: TagSpecDefinition): WizardFormState {
  return {
    tag: def.Tag,
    context: { ...def.Context },
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
        dataType: attr.DataType,
        sourceField: attr.AttributeRuleExpression.SourceField,
        extractionOperation: decomposed.operation,
        prefix: decomposed.prefix,
        suffix: decomposed.suffix,
        pattern: decomposed.pattern,
      };
    }),
  };
}

export function useWizardForm(
  existingDef?: TagSpecDefinition,
  initialFormState?: WizardFormState,
  defaultSourceField: string = 'Field86',
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
      dataType: 'STRING',
      sourceField: defaultSourceField,
      extractionOperation: 'predefined:ksa_iban',
      prefix: '',
      suffix: '',
    };
  }

  function createInitialState(): WizardFormState {
    return {
      tag: '',
      context: { Side: 'CR', TxnType: 'TRF' },
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

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [formState, setFormState] = useState<WizardFormState>(
    existingDef
      ? fromExistingDefinition(existingDef)
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
    (updates: Partial<Pick<WizardFormState, 'tag' | 'context' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => {
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

  // --- Convert form state to TagSpecDefinition ---
  const toTagSpecDefinition = useCallback((): TagSpecDefinition => {
    const id = existingDef?.Id ?? generateId();

    return {
      Id: id,
      Tag: formState.tag,
      Context: formState.context,
      StatusTag: formState.statusTag,
      CertaintyLevelTag: formState.certaintyLevelTag,
      Validity: formState.validity,
      TagRuleExpressions: formState.ruleGroups.map((group) =>
        group.conditions.map((c) => ({
          SourceField: c.sourceField,
          ExpressionPrompt: generateExpressionPrompt(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          }),
          ExpressionId: null,
          Regex: regexify(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          }),
        }))
      ),
      Attributes: formState.attributes.map((attr, index) => ({
        AttributeTag: attr.attributeTag,
        IsMandatory: attr.isMandatory,
        DataType: attr.dataType,
        AttributeRuleExpression: {
          SourceField: attr.sourceField,
          ExpressionPrompt: generateExtractionPrompt(attr.extractionOperation, {
            prefix: attr.prefix,
            suffix: attr.suffix,
            pattern: attr.pattern,
          }),
          ExpressionId: generateExpressionId(id, 'attr', index),
          Regex: regexifyExtraction(attr.extractionOperation, {
            prefix: attr.prefix,
            suffix: attr.suffix,
            pattern: attr.pattern,
          }),
        },
      })),
    };
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
