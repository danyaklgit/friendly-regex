import type {
  TagSpecDefinition,
  WizardFormState,
  AndGroupFormValue,
  AttributeFormValue,
  ExtractionOperation,
} from '../types';
import { decomposeRegex, decomposeExtractionRegex } from './engregxify';

export type RulesAndAttributesSlice = Pick<WizardFormState, 'ruleGroups' | 'attributes'>;

/**
 * Produces the rules+attributes slice of WizardFormState derived from an existing
 * TagSpecDefinition. Used both by fromExistingDefinition (edit mode) and by the
 * "Duplicate Rules From Tag" feature (create mode template).
 *
 * Every id (group, condition, attribute, transformation) is regenerated so the
 * cloned form state is independent of the source. _originalRegex is intentionally
 * dropped: when used as a template, the cloned attribute is a brand-new attribute
 * on a different tag, and keeping the source's stored regex could mask edits.
 */
export function cloneRulesAndAttributesFrom(def: TagSpecDefinition): RulesAndAttributesSlice {
  const ruleGroups: AndGroupFormValue[] = def.TagRuleExpressions.map((andGroup) => ({
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
  }));

  const attributes: AttributeFormValue[] = def.Attributes.map((attr) => {
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
      suffixOrEndOfInput: decomposed.suffixOrEndOfInput,
      verifyValue: attr.AttributeRuleExpression.VerifyValue,
      lovTag: attr.LOVTag ?? null,
      isLovBased: !!attr.LOVTag,
      transformations: (attr.Transformations ?? []).map((t) => ({
        id: crypto.randomUUID(),
        method: t.Method,
        args: Object.fromEntries(t.Args.map((a) => [a.Key, a.Value])),
      })),
    };
  });

  return { ruleGroups, attributes };
}
