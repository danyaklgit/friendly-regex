import type {
  TagSpecDefinition,
  WizardFormState,
  AndGroupFormValue,
  AttributeFormValue,
  ExtractionOperation,
  TagAttribute,
} from '../types';
import type { ExtractionMethodDef } from '../types/lov';
import { decomposeRegex, decomposeExtractionRegex } from './engregxify';
import { ensureLovExtractionCaptureGroup } from './regexify';

export type RulesAndAttributesSlice = Pick<WizardFormState, 'ruleGroups' | 'attributes'>;

/**
 * Convert a backend TagAttribute into an AttributeFormValue suitable for the
 * wizard's form state. Every id (the attribute, each transformation) is
 * regenerated so the cloned form value is independent of the source. The
 * stored `_originalRegex` is intentionally NOT carried over — when cloning
 * across definitions, keeping the source regex would mask the regex the
 * operator just re-derived from extraction params.
 *
 * `lovExtractions` lets us map a stored regex back to its `lov:*` operation
 * key (so the dropdown shows the friendly LOV label instead of falling
 * through to `extract_matching` with a raw pattern).
 */
export function cloneAttributeFromBackend(
  attr: TagAttribute,
  lovExtractions: ExtractionMethodDef[] = [],
): AttributeFormValue {
  // Constant-mode attribute: backend sends `Constant: "<value>"` with
  // `AttributeRuleExpression` / `Transformations` / `PreExtractionTransformations`
  // all bypassed at runtime. Short-circuit the regex decompose entirely and
  // surface as `isConstant` in form state, with both transformation lists
  // empty — toggling Constant off later starts the operator from a clean slate.
  if (attr.Constant != null) {
    return {
      id: crypto.randomUUID(),
      attributeTag: attr.AttributeTag,
      isMandatory: attr.IsMandatory,
      validationRuleTag: '',
      sourceField: '',
      extractionOperation: '' as ExtractionOperation,
      isConstant: true,
      constantValue: attr.Constant,
      isLovBased: false,
      lovTag: null,
      preExtractionTransformations: [],
      transformations: [],
    };
  }
  const expr = attr.AttributeRuleExpression;
  // Defensive: a non-constant attribute should always carry an
  // AttributeRuleExpression. If a backend bug ships one without, degrade
  // to a permissive "extract full field" placeholder rather than crashing.
  if (!expr) {
    return {
      id: crypto.randomUUID(),
      attributeTag: attr.AttributeTag,
      isMandatory: attr.IsMandatory,
      validationRuleTag: attr.ValidationRuleTag,
      sourceField: '',
      extractionOperation: 'extract_full_field' as ExtractionOperation,
      lovTag: attr.LOVTag ?? null,
      isLovBased: !!attr.LOVTag,
      preExtractionTransformations: (attr.PreExtractionTransformations ?? []).map((t) => ({
        id: crypto.randomUUID(),
        method: t.Method,
        args: Object.fromEntries(t.Args.map((a) => [a.Key, a.Value])),
      })),
      transformations: (attr.Transformations ?? []).map((t) => ({
        id: crypto.randomUUID(),
        method: t.Method,
        args: Object.fromEntries(t.Args.map((a) => [a.Key, a.Value])),
      })),
    };
  }
  const storedRegex = expr.Regex;
  // Compare against BOTH the raw LOV regex and its capture-group-wrapped
  // form (what regexifyExtraction now produces) so validation-style LOV
  // entries round-trip correctly even after the save-time wrap.
  const lovMatch = !expr.VerifyValue
    ? lovExtractions.find((m) =>
        m.regex === storedRegex
        || ensureLovExtractionCaptureGroup(m.regex) === storedRegex,
      )
    : undefined;
  const decomposed = decomposeExtractionRegex(storedRegex);
  const extractionOperation: ExtractionOperation = lovMatch
    ? (lovMatch.key as ExtractionOperation)
    : expr.VerifyValue
      ? 'extract_between_and_verify'
      : decomposed.operation;
  return {
    id: crypto.randomUUID(),
    attributeTag: attr.AttributeTag,
    isMandatory: attr.IsMandatory,
    validationRuleTag: attr.ValidationRuleTag,
    sourceField: expr.SourceField,
    extractionOperation,
    // LOV-driven extractions carry no params — drop anything decompose
    // pulled out (it would just be the raw regex shoved into `pattern`).
    prefix: lovMatch ? undefined : decomposed.prefix,
    suffix: lovMatch ? undefined : decomposed.suffix,
    pattern: lovMatch ? undefined : decomposed.pattern,
    suffixOrEndOfInput: lovMatch ? undefined : decomposed.suffixOrEndOfInput,
    numChars: lovMatch ? undefined : decomposed.numChars,
    fromPosition: lovMatch ? undefined : decomposed.fromPosition,
    tillEndOfInput: lovMatch ? undefined : decomposed.tillEndOfInput,
    verifyValue: expr.VerifyValue,
    lovTag: attr.LOVTag ?? null,
    isLovBased: !!attr.LOVTag,
    preExtractionTransformations: (attr.PreExtractionTransformations ?? []).map((t) => ({
      id: crypto.randomUUID(),
      method: t.Method,
      args: Object.fromEntries(t.Args.map((a) => [a.Key, a.Value])),
    })),
    transformations: (attr.Transformations ?? []).map((t) => ({
      id: crypto.randomUUID(),
      method: t.Method,
      args: Object.fromEntries(t.Args.map((a) => [a.Key, a.Value])),
    })),
  };
}

/**
 * Produces the rules+attributes slice of WizardFormState derived from an existing
 * TagSpecDefinition. Used both by fromExistingDefinition (edit mode) and by the
 * "Duplicate Rules From Tag" feature (create mode template).
 *
 * Every id (group, condition, attribute, transformation) is regenerated so the
 * cloned form state is independent of the source. _originalRegex is intentionally
 * dropped: when used as a template, the cloned attribute is a brand-new attribute
 * on a different tag, and keeping the source's stored regex could mask edits.
 *
 * `lovExtractions` is optional — when provided, any stored extraction regex
 * that exactly equals a LOV item's Value is mapped to the `lov:*` operation key
 * (so the dropdown shows the friendly LOV label instead of falling through to
 * `extract_matching` with a raw regex pattern).
 */
export function cloneRulesAndAttributesFrom(
  def: TagSpecDefinition,
  lovExtractions: ExtractionMethodDef[] = [],
): RulesAndAttributesSlice {
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

  const attributes: AttributeFormValue[] = def.Attributes.map(
    (attr) => cloneAttributeFromBackend(attr, lovExtractions),
  );

  return { ruleGroups, attributes };
}
