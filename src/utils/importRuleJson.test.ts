import { describe, it, expect } from 'vitest';
import { parseRuleImport } from './importRuleJson';

/** Helper: parse and assert success, returning the formState. */
function ok(text: string) {
  const r = parseRuleImport(text);
  if (!r.ok) throw new Error(`expected ok, got errors: ${r.errors.join('; ')}`);
  return r;
}

describe('parseRuleImport — failures', () => {
  it('rejects invalid JSON', () => {
    const r = parseRuleImport('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Invalid JSON/);
  });

  it('rejects a non-object payload', () => {
    const r = parseRuleImport('[1,2,3]');
    expect(r.ok).toBe(false);
  });

  it('requires a tag', () => {
    const r = parseRuleImport(JSON.stringify({ attributes: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /tag is required/.test(e))).toBe(true);
  });

  it('errors on an unknown enum value', () => {
    const r = parseRuleImport(JSON.stringify({ tag: 'X', certaintyLevelTag: 'SUPER' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /certaintyLevelTag/.test(e))).toBe(true);
  });

  it('errors on an unknown condition operation', () => {
    const r = parseRuleImport(JSON.stringify({
      tag: 'X', ruleGroups: [{ conditions: [{ sourceField: 'A', operation: 'sorta_contains', value: 'y' }] }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /unknown operation "sorta_contains"/.test(e))).toBe(true);
  });

  it('errors on an unknown extraction operation', () => {
    const r = parseRuleImport(JSON.stringify({
      tag: 'X', attributes: [{ attributeTag: 'A', extractionOperation: 'extract_teleport', sourceField: 'F' }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /extract_teleport/.test(e))).toBe(true);
  });

  it('requires attributeTag on each attribute', () => {
    const r = parseRuleImport(JSON.stringify({
      tag: 'X', attributes: [{ extractionOperation: 'extract_full_field', sourceField: 'F' }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /attributeTag/.test(e))).toBe(true);
  });
});

describe('parseRuleImport — defaults & enums', () => {
  it('applies defaults for a minimal payload and normalizes enum case', () => {
    const r = ok(JSON.stringify({ tag: 'MyTag', side: 'dr', statusTag: 'active' }));
    expect(r.formState.tag).toBe('MyTag');
    expect(r.formState.side).toBe('DR');
    expect(r.formState.statusTag).toBe('ACTIVE');
    expect(r.formState.certaintyLevelTag).toBe('HIGH');
    expect(r.formState.dataSetType).toBe('MT940');
    expect(r.formState.validity).toEqual({ StartDate: null, EndDate: null });
    expect(r.formState.ruleGroups).toEqual([]);
    expect(r.formState.attributes).toEqual([]);
  });

  it('warns when transactionTypeCode is missing', () => {
    const r = ok(JSON.stringify({ tag: 'MyTag' }));
    expect(r.warnings.some((w) => /transactionTypeCode/.test(w))).toBe(true);
  });
});

describe('parseRuleImport — a full RJHI-style rule', () => {
  const payload = {
    tag: 'POSCharges',
    dataSetType: 'MT940',
    side: 'DR',
    bankSwiftCode: 'RJHISARI',
    transactionTypeCode: 'TRF',
    certaintyLevelTag: 'HIGH',
    ruleGroups: [
      { conditions: [{ sourceField: 'AdditionalInformation', operation: 'begins_with', value: '/PT/Debit POS low Value fees' }] },
    ],
    attributes: [
      { attributeTag: 'FeeType', isConstant: true, constantValue: 'POS LOW VALUE FEES' },
      {
        attributeTag: 'TerminalID',
        isMandatory: true,
        validationRuleTag: 'STRING',
        sourceField: 'AdditionalInformation',
        extractionOperation: 'extract_between',
        prefix: '/PT/Debit POS low Value fees ',
        suffix: ' ',
        suffixOrEndOfInput: true,
        transformations: [{ method: 'trim', args: {} }],
      },
    ],
  };

  it('maps identity, conditions, and both attribute kinds', () => {
    const { formState } = ok(JSON.stringify(payload));
    expect(formState.tag).toBe('POSCharges');
    expect(formState.side).toBe('DR');
    expect(formState.transactionTypeCode).toBe('TRF');

    // condition
    expect(formState.ruleGroups).toHaveLength(1);
    const cond = formState.ruleGroups[0].conditions[0];
    expect(cond.operation).toBe('begins_with');
    expect(cond.value).toBe('/PT/Debit POS low Value fees');
    expect(cond.id).toBeTruthy();

    // constant attribute
    const [fee, terminal] = formState.attributes;
    expect(fee.isConstant).toBe(true);
    expect(fee.constantValue).toBe('POS LOW VALUE FEES');

    // extraction attribute + params + transform
    expect(terminal.isConstant).toBeFalsy();
    expect(terminal.extractionOperation).toBe('extract_between');
    expect(terminal.prefix).toBe('/PT/Debit POS low Value fees ');
    expect(terminal.suffix).toBe(' ');
    expect(terminal.suffixOrEndOfInput).toBe(true);
    expect(terminal.isMandatory).toBe(true);
    expect(terminal.validationRuleTag).toBe('STRING');
    expect(terminal.transformations).toEqual([{ id: expect.any(String), method: 'trim', args: {} }]);
  });

  it('generates fresh ids everywhere', () => {
    const { formState } = ok(JSON.stringify(payload));
    expect(formState.ruleGroups[0].id).toBeTruthy();
    expect(formState.ruleGroups[0].conditions[0].id).toBeTruthy();
    expect(formState.attributes[0].id).toBeTruthy();
    expect(formState.attributes[1].id).not.toBe(formState.attributes[0].id);
  });
});

describe('parseRuleImport — raw regex conveniences & multi-value', () => {
  it('maps a bare condition regex to match_regex', () => {
    const { formState } = ok(JSON.stringify({
      tag: 'X', ruleGroups: [{ conditions: [{ sourceField: 'A', regex: '^/PT/Debit\\s\\S+$' }] }],
    }));
    const cond = formState.ruleGroups[0].conditions[0];
    expect(cond.operation).toBe('match_regex');
    expect(cond.value).toBe('^/PT/Debit\\s\\S+$');
  });

  it('maps a bare attribute regex to extract_matching + pattern', () => {
    const { formState } = ok(JSON.stringify({
      tag: 'X', attributes: [{ attributeTag: 'P', sourceField: 'A', regex: '([A-Z]+\\s\\d{4})' }],
    }));
    const attr = formState.attributes[0];
    expect(attr.extractionOperation).toBe('extract_matching');
    expect(attr.pattern).toBe('([A-Z]+\\s\\d{4})');
  });

  it('carries values[] for matches_pattern', () => {
    const { formState } = ok(JSON.stringify({
      tag: 'X', ruleGroups: [{ conditions: [{ sourceField: 'A', operation: 'matches_pattern', values: ['a', 'b'] }] }],
    }));
    expect(formState.ruleGroups[0].conditions[0].values).toEqual(['a', 'b']);
  });

  it('warns on an unknown transformation method but still imports', () => {
    const r = ok(JSON.stringify({
      tag: 'X', attributes: [{ attributeTag: 'P', sourceField: 'A', extractionOperation: 'extract_full_field', transformations: [{ method: 'frobnicate', args: {} }] }],
    }));
    expect(r.warnings.some((w) => /frobnicate/.test(w))).toBe(true);
    expect(r.formState.attributes[0].transformations).toHaveLength(1);
  });

  it('coerces numeric params and stringifies transformation args', () => {
    const { formState } = ok(JSON.stringify({
      tag: 'X', attributes: [{
        attributeTag: 'P', sourceField: 'A', extractionOperation: 'extract_last_n_chars', numChars: 6,
        transformations: [{ method: 'pad_left', args: { length: 3, char: '0' } }],
      }],
    }));
    expect(formState.attributes[0].numChars).toBe(6);
    expect(formState.attributes[0].transformations?.[0].args).toEqual({ length: '3', char: '0' });
  });
});

// Keeps the worked examples in docs/rule-json-import-skill.md (the external
// skill's few-shot examples) importing cleanly. If the schema changes, these
// break here before they break for a user pasting skill output.
describe('parseRuleImport — skill doc worked examples import cleanly', () => {
  const examples = [
    {
      tag: 'POSCharges', dataSetType: 'MT940', side: 'DR', bankSwiftCode: 'RJHISARI',
      transactionTypeCode: 'TRF', certaintyLevelTag: 'HIGH',
      ruleGroups: [{ conditions: [{ sourceField: 'AdditionalInformation', operation: 'begins_with', value: '/PT/Debit POS low Value fees' }] }],
      attributes: [
        { attributeTag: 'FeeType', isConstant: true, constantValue: 'POS LOW VALUE FEES' },
        { attributeTag: 'TerminalID', isMandatory: true, validationRuleTag: 'STRING', sourceField: 'AdditionalInformation', extractionOperation: 'extract_between', prefix: '/PT/Debit POS low Value fees ', suffix: ' ', suffixOrEndOfInput: true, transformations: [{ method: 'trim', args: {} }] },
      ],
    },
    {
      tag: 'CardPayment', side: 'DR', bankSwiftCode: 'RJHISARI', transactionTypeCode: 'TRF', certaintyLevelTag: 'HIGH',
      ruleGroups: [{ conditions: [
        { sourceField: 'AdditionalInformation', operation: 'begins_with', value: '/PT/Debit - Credit Cards Transactions' },
        { sourceField: 'AdditionalInformation', operation: 'contains', value: 'Auto-debit for Card ending - ' },
      ] }],
      attributes: [{ attributeTag: 'CardNumberMasked', sourceField: 'AdditionalInformation', extractionOperation: 'extract_between', prefix: '/PT/Debit - Credit Cards Transactions Auto-debit for Card ending -', suffix: ' for', suffixOrEndOfInput: true, transformations: [{ method: 'trim', args: {} }, { method: 'add_to_start', args: { text: '**** **** **** ' } }] }],
    },
    {
      tag: 'MiscDebit', side: 'DR', bankSwiftCode: 'RJHISARI', transactionTypeCode: 'TRF', certaintyLevelTag: 'HIGH',
      ruleGroups: [{ conditions: [
        { sourceField: 'AdditionalInformation', operation: 'match_regex', value: '^/PT/Debit\\s\\S+$' },
        { sourceField: 'AdditionalInformation', operation: 'match_regex', value: '^/PT/Debit\\s\\S*\\d' },
      ] }],
      attributes: [{ attributeTag: 'TransactionDetails', sourceField: 'AdditionalInformation', extractionOperation: 'extract_after', prefix: '/PT/Debit', transformations: [{ method: 'trim', args: {} }] }],
    },
  ];

  it.each(examples)('imports example for tag $tag', (payload) => {
    const r = parseRuleImport(JSON.stringify(payload));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formState.tag).toBe(payload.tag);
  });
});

describe('parseRuleImport — nickname', () => {
  it('carries an optional nickname into the form state', () => {
    const res = parseRuleImport(JSON.stringify({ tag: 'CheckIn', nickname: 'Internal deposits', transactionTypeCode: '101' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.formState.nickname).toBe('Internal deposits');
  });

  it('defaults nickname to empty when absent', () => {
    const res = parseRuleImport(JSON.stringify({ tag: 'CheckIn', transactionTypeCode: '101' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.formState.nickname).toBe('');
  });
});
