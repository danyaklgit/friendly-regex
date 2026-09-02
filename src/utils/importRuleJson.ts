import type {
  WizardFormState,
  AndGroupFormValue,
  ConditionFormValue,
  AttributeFormValue,
  TransformationFormValue,
  MatchOperation,
  ExtractionOperation,
} from '../types/wizard';
import type { StatusTag, CertaintyLevelTag, TagValidity } from '../types/tagSpec';
import { MATCH_OPERATIONS, EXTRACTION_OPERATIONS } from '../constants/operations';
import { TRANSFORMATION_METHODS } from '../constants/transformations';
import { DATA_SET_TYPES } from '../constants/dataSetTypes';
import { SIDE_OPTIONS } from '../constants/fields';

/**
 * Parse a pasted rule JSON payload into a `WizardFormState` that seeds the Tag
 * Wizard (via its `initialFormState` prop). The payload mirrors the form model
 * 1:1 — see the "Rule JSON" schema doc — so no regex build/decompose round-trip
 * is needed: conditions carry an `operation` + `value`, attributes carry an
 * `extractionOperation` + its params (or `isConstant`/`constantValue`), and
 * transformations carry `method` + `args`.
 *
 * Raw regex is supported without a special field: a condition may use
 * `operation: "match_regex"` (regex in `value`), and an attribute may use
 * `extractionOperation: "extract_matching"` with `pattern` set. As a
 * convenience, a bare `regex` string on either maps to those.
 *
 * Validation is strict on the crucial bits (enum values, known operations /
 * transformation methods, required fields) so a malformed payload surfaces
 * actionable errors rather than silently producing a broken rule. Unknown
 * transformation methods are warnings (the catalog may lag the backend), not
 * hard errors.
 */

export type RuleImportResult =
  | { ok: true; formState: WizardFormState; warnings: string[] }
  | { ok: false; errors: string[] };

const SIDES = SIDE_OPTIONS as readonly string[];
const STATUSES: readonly StatusTag[] = ['ACTIVE', 'INACTIVE', 'DRAFT', 'INPROGRESS'];
const CERTAINTIES: readonly CertaintyLevelTag[] = ['HIGH', 'MEDIUM', 'LOW'];
const MATCH_OP_KEYS = new Set<string>(MATCH_OPERATIONS.map((o) => o.key));
const EXTRACTION_OP_KEYS = new Set<string>(EXTRACTION_OPERATIONS.map((o) => o.key));
const TRANSFORM_KEYS = new Set<string>(TRANSFORMATION_METHODS.map((t) => t.key));

function uuid(): string {
  return crypto.randomUUID();
}

function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Coerce a number or numeric string to a finite number, else undefined. */
function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Resolve a value against a canonical enum set (case-insensitively). Absent →
 *  default (no error). Present but unrecognized → default + a validation error. */
function resolveEnum<T extends string>(
  v: unknown,
  canonical: readonly T[],
  fallback: T,
  field: string,
  errors: string[],
): T {
  if (v == null || v === '') return fallback;
  if (typeof v === 'string') {
    const exact = canonical.find((c) => c === v);
    if (exact) return exact;
    const ci = canonical.find((c) => c.toLowerCase() === v.toLowerCase());
    if (ci) return ci;
  }
  errors.push(`${field}: "${String(v)}" is not one of ${canonical.join(', ')}.`);
  return fallback;
}

function convValidity(v: unknown, errors: string[]): TagValidity {
  if (v == null) return { StartDate: null, EndDate: null };
  if (typeof v !== 'object' || Array.isArray(v)) {
    errors.push('validity must be an object like { "StartDate": "YYYY-MM-DD" | null, "EndDate": ... }.');
    return { StartDate: null, EndDate: null };
  }
  const o = v as Record<string, unknown>;
  const bound = (raw: unknown): string | null => (typeof raw === 'string' && raw.trim() !== '' ? raw : null);
  return { StartDate: bound(o.StartDate), EndDate: bound(o.EndDate) };
}

function convTransforms(
  raw: unknown,
  path: string,
  errors: string[],
  warnings: string[],
): TransformationFormValue[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`${path} must be an array.`);
    return [];
  }
  return raw.map((t, i) => {
    const rec = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    const method = asString(rec.method);
    if (!method) errors.push(`${path}[${i}]: transformation "method" is required.`);
    else if (!TRANSFORM_KEYS.has(method)) warnings.push(`${path}[${i}]: unknown transformation method "${method}".`);
    const args: Record<string, string> = {};
    if (rec.args && typeof rec.args === 'object' && !Array.isArray(rec.args)) {
      for (const [k, val] of Object.entries(rec.args as Record<string, unknown>)) {
        args[k] = val == null ? '' : String(val);
      }
    }
    return { id: uuid(), method, args };
  });
}

function convCondition(raw: unknown, path: string, errors: string[]): ConditionFormValue {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let operation = asString(rec.operation);
  let value = rec.value;
  // Bare-regex convenience: `regex` with no operation → match_regex.
  if (!operation && typeof rec.regex === 'string') {
    operation = 'match_regex';
    value = rec.regex;
  }
  if (!operation) errors.push(`${path}: condition "operation" is required.`);
  else if (!MATCH_OP_KEYS.has(operation)) errors.push(`${path}: unknown operation "${operation}".`);

  const valuesArr = Array.isArray(rec.values) ? (rec.values as unknown[]).map((x) => asString(x)) : undefined;
  const singleValue = typeof value === 'string' ? value : valuesArr?.[0] ?? (value != null ? String(value) : '');

  const cond: ConditionFormValue = {
    id: uuid(),
    sourceField: asString(rec.sourceField),
    operation: operation as MatchOperation,
    value: singleValue,
  };
  // matches_pattern is the multi-value operator; carry the array (fall back to
  // the single value so a lone pattern still round-trips).
  if (operation === 'matches_pattern') {
    cond.values = valuesArr && valuesArr.length > 0 ? valuesArr : singleValue ? [singleValue] : [];
  } else if (valuesArr) {
    cond.values = valuesArr;
  }
  return cond;
}

function convRuleGroups(raw: unknown, errors: string[]): AndGroupFormValue[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.push('ruleGroups must be an array.');
    return [];
  }
  return raw.map((g, gi) => {
    const rec = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
    const conditionsRaw = rec.conditions;
    if (!Array.isArray(conditionsRaw)) {
      errors.push(`ruleGroups[${gi}].conditions must be an array.`);
      return { id: uuid(), conditions: [] };
    }
    return {
      id: uuid(),
      conditions: conditionsRaw.map((c, ci) => convCondition(c, `ruleGroups[${gi}].conditions[${ci}]`, errors)),
    };
  });
}

function isValidExtractionOp(op: string): boolean {
  return EXTRACTION_OP_KEYS.has(op) || op.startsWith('predefined:') || op.startsWith('lov:');
}

function convAttribute(
  raw: unknown,
  path: string,
  errors: string[],
  warnings: string[],
): AttributeFormValue {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const attributeTag = asString(rec.attributeTag ?? rec.name);
  if (!attributeTag) errors.push(`${path}: "attributeTag" is required.`);

  const base = {
    id: uuid(),
    attributeTag,
    isMandatory: asBool(rec.isMandatory),
  };

  // Constant attribute: extraction / source / transforms / validation are ignored.
  if (rec.isConstant === true) {
    const constantValue = asString(rec.constantValue);
    if (!constantValue) warnings.push(`${path}: isConstant is true but constantValue is empty.`);
    return {
      ...base,
      validationRuleTag: '',
      sourceField: '',
      extractionOperation: '' as ExtractionOperation,
      isConstant: true,
      constantValue,
      // Constant-LOV: accept lovTag alongside the constant (the constant is
      // the LOV item tag). Whether the tag exists in the list is checked by
      // the editor after load (marked "not in list"), not by the parser.
      isLovBased: rec.lovTag != null && rec.lovTag !== '',
      lovTag: rec.lovTag != null && rec.lovTag !== '' ? String(rec.lovTag) : null,
      preExtractionTransformations: [],
      transformations: [],
    };
  }

  // Extraction attribute.
  let extractionOperation = asString(rec.extractionOperation);
  let pattern = rec.pattern;
  if (!extractionOperation && typeof rec.regex === 'string') {
    extractionOperation = 'extract_matching';
    pattern = rec.regex;
  }
  if (!extractionOperation) errors.push(`${path}: "extractionOperation" is required (or set isConstant).`);
  else if (!isValidExtractionOp(extractionOperation)) errors.push(`${path}: unknown extractionOperation "${extractionOperation}".`);

  const attr: AttributeFormValue = {
    ...base,
    validationRuleTag: asString(rec.validationRuleTag),
    sourceField: asString(rec.sourceField),
    extractionOperation: extractionOperation as ExtractionOperation,
    preExtractionTransformations: convTransforms(rec.preExtractionTransformations, `${path}.preExtractionTransformations`, errors, warnings),
    transformations: convTransforms(rec.transformations, `${path}.transformations`, errors, warnings),
  };

  // String params (only set when present so the form's optionals stay clean).
  if (rec.prefix != null) attr.prefix = asString(rec.prefix);
  if (rec.suffix != null) attr.suffix = asString(rec.suffix);
  if (pattern != null) attr.pattern = asString(pattern);
  if (rec.toStr != null) attr.toStr = asString(rec.toStr);
  if (rec.verifyValue != null) attr.verifyValue = asString(rec.verifyValue);

  // Number params.
  const numChars = asNumber(rec.numChars);
  if (numChars !== undefined) attr.numChars = numChars;
  const occurrence = asNumber(rec.occurrence);
  if (occurrence !== undefined) attr.occurrence = occurrence;
  const startingPosition = asNumber(rec.startingPosition);
  if (startingPosition !== undefined) attr.startingPosition = startingPosition;
  const fromPosition = asNumber(rec.fromPosition);
  if (fromPosition !== undefined) attr.fromPosition = fromPosition;
  const prefixOccurrence = asNumber(rec.prefixOccurrence);
  if (prefixOccurrence !== undefined) attr.prefixOccurrence = prefixOccurrence;
  const suffixOccurrence = asNumber(rec.suffixOccurrence);
  if (suffixOccurrence !== undefined) attr.suffixOccurrence = suffixOccurrence;

  // Boolean params.
  if (rec.toStart != null) attr.toStart = asBool(rec.toStart);
  if (rec.tillEndOfInput != null) attr.tillEndOfInput = asBool(rec.tillEndOfInput);
  if (rec.suffixOrEndOfInput != null) attr.suffixOrEndOfInput = asBool(rec.suffixOrEndOfInput);

  // LOV validation list (distinct from a `lov:` extraction op).
  if (rec.lovTag != null && rec.lovTag !== '') {
    attr.lovTag = asString(rec.lovTag);
    attr.isLovBased = true;
  } else {
    attr.lovTag = null;
    attr.isLovBased = asBool(rec.isLovBased);
  }
  if (rec.lovMissBehavior === 'KEEP_TEXT' || rec.lovMissBehavior === 'CLEAR_TEXT') {
    attr.lovMissBehavior = rec.lovMissBehavior;
  }

  return attr;
}

export function parseRuleImport(text: string): RuleImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Payload must be a JSON object with a "tag" and "attributes".'] };
  }
  const p = raw as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  const tag = asString(p.tag);
  if (!tag) errors.push('tag is required.');

  const dataSetType = resolveEnum(p.dataSetType, DATA_SET_TYPES, 'MT940', 'dataSetType', errors);
  const side = resolveEnum(p.side, SIDES, 'CR', 'side', errors);
  const statusTag = resolveEnum(p.statusTag, STATUSES, 'ACTIVE', 'statusTag', errors);
  const certaintyLevelTag = resolveEnum(p.certaintyLevelTag, CERTAINTIES, 'HIGH', 'certaintyLevelTag', errors);
  const validity = convValidity(p.validity, errors);
  const ruleGroups = convRuleGroups(p.ruleGroups, errors);

  if (p.attributes != null && !Array.isArray(p.attributes)) errors.push('attributes must be an array.');
  const attributes = Array.isArray(p.attributes)
    ? p.attributes.map((a, i) => convAttribute(a, `attributes[${i}]`, errors, warnings))
    : [];

  const transactionTypeCode = asString(p.transactionTypeCode);
  if (!transactionTypeCode) warnings.push('transactionTypeCode is empty — the wizard requires it before saving; fill it in on the Basic Info step.');

  if (errors.length > 0) return { ok: false, errors };

  const formState: WizardFormState = {
    tag,
    side,
    bankSwiftCode: asString(p.bankSwiftCode),
    dataSetType,
    clientCode: asString(p.clientCode),
    erpCode: asString(p.erpCode),
    transactionTypeCode,
    statusTag,
    certaintyLevelTag,
    validity,
    ruleGroups,
    attributes,
  };
  return { ok: true, formState, warnings };
}
