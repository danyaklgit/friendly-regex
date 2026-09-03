import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fromExistingDefinition, useWizardForm } from './useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary } from '../types';

function mkDef(overrides: Partial<TagSpecDefinition> = {}): TagSpecDefinition {
  return {
    Id: 'def-1',
    Tag: 'SALARY',
    Context: [{ Key: 'TransactionTypeCode', Value: '101' }],
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [],
    Attributes: [],
    ...overrides,
  };
}

function mkLib(overrides: Partial<TagSpecLibrary> = {}): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: null,
    OperatorId: 'op',
    StatusTag: 'ACTIVE',
    DataSetType: 'MT940',
    Version: 1,
    VersionDate: '2024-01-01',
    Context: [
      { Key: 'BankSwiftCode', Value: 'ARNBSARI' },
      { Key: 'Side', Value: 'CR' },
    ],
    TagSpecDefinitions: [],
    ...overrides,
  };
}

describe('fromExistingDefinition — Validity round-trip', () => {
  it('loads both StartDate and EndDate from the backend definition', () => {
    const def = mkDef({ Validity: { StartDate: '2024-01-01', EndDate: '2024-12-31' } });
    const formState = fromExistingDefinition(def, mkLib());
    expect(formState.validity).toEqual({ StartDate: '2024-01-01', EndDate: '2024-12-31' });
  });

  it('preserves a single-sided range (StartDate only)', () => {
    const def = mkDef({ Validity: { StartDate: '2024-06-15', EndDate: null } });
    const formState = fromExistingDefinition(def, mkLib());
    expect(formState.validity).toEqual({ StartDate: '2024-06-15', EndDate: null });
  });

  it('preserves a single-sided range (EndDate only)', () => {
    const def = mkDef({ Validity: { StartDate: null, EndDate: '2025-03-31' } });
    const formState = fromExistingDefinition(def, mkLib());
    expect(formState.validity).toEqual({ StartDate: null, EndDate: '2025-03-31' });
  });

  it('keeps both nulls when the backend definition has no validity', () => {
    const formState = fromExistingDefinition(mkDef(), mkLib());
    expect(formState.validity).toEqual({ StartDate: null, EndDate: null });
  });

  it('detaches the form-state validity from the source object', () => {
    const def = mkDef({ Validity: { StartDate: '2024-01-01', EndDate: '2024-12-31' } });
    const formState = fromExistingDefinition(def, mkLib());
    // Mutating the form-state copy must NOT mutate the source — operators
    // that discard their edits must leave the original definition intact.
    formState.validity.StartDate = '1999-01-01';
    expect(def.Validity.StartDate).toBe('2024-01-01');
  });

  it('normalizes the backend "no validity start" sentinel to null on read', () => {
    // The live GetTagSpecLibraries response ships every rule with this
    // exact placeholder when the operator hasn't set a real start date.
    // If the sentinel leaks into form state, the Basic Info Validity
    // section would render "12/31/2025" for rules the operator believes
    // have no validity and fire the per-picker × clear control.
    const def = mkDef({ Validity: { StartDate: '2025-12-31T22:00:00Z', EndDate: null } });
    const formState = fromExistingDefinition(def, mkLib());
    expect(formState.validity).toEqual({ StartDate: null, EndDate: null });
  });

  it('preserves a bare 2025-12-31 date (no time portion) as a real operator value', () => {
    // Only the exact sentinel collapses to null. A user-set 2025-12-31
    // is a real validity bound and must round-trip unchanged.
    const def = mkDef({ Validity: { StartDate: '2025-12-31', EndDate: null } });
    const formState = fromExistingDefinition(def, mkLib());
    expect(formState.validity.StartDate).toBe('2025-12-31');
  });
});

describe('useWizardForm — Validity round-trip via the hook', () => {
  it('seeds Validity as { null, null } when creating a brand new rule', () => {
    const { result } = renderHook(() => useWizardForm());
    expect(result.current.formState.validity).toEqual({ StartDate: null, EndDate: null });
  });

  it('hydrates Validity from existingDef when editing an existing rule', () => {
    const def = mkDef({ Validity: { StartDate: '2024-01-01', EndDate: '2024-12-31' } });
    const { result } = renderHook(() => useWizardForm(def, undefined, undefined, mkLib()));
    expect(result.current.formState.validity).toEqual({ StartDate: '2024-01-01', EndDate: '2024-12-31' });
  });

  it('writes updated Validity dates back through toTagSpecDefinition (lifted to ISO datetime)', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({ tag: 'SALARY', transactionTypeCode: '101' });
    });
    act(() => {
      result.current.updateBasicInfo({
        validity: { StartDate: '2024-06-01', EndDate: '2024-06-30' },
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Validity).toEqual({
      StartDate: '2024-06-01T00:00:00Z',
      EndDate: '2024-06-30T00:00:00Z',
    });
  });

  it('coerces empty-string Validity bounds to null on save', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      // Form state may carry empty strings (e.g. from a cleared <input
      // type="date">) — the converter must normalize them to null on the
      // wire so the backend doesn't see "" and interpret it as a literal
      // date string.
      result.current.updateBasicInfo({
        validity: { StartDate: '' as unknown as string | null, EndDate: '' as unknown as string | null },
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Validity).toEqual({ StartDate: null, EndDate: null });
  });

  it('preserves a single-sided range through toTagSpecDefinition', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({
        validity: { StartDate: '2024-09-01', EndDate: null },
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Validity).toEqual({ StartDate: '2024-09-01T00:00:00Z', EndDate: null });
  });

  it('lifts bare YYYY-MM-DD validity bounds to full ISO datetimes on save', () => {
    // The backend stores Validity as a full ISO datetime (the sentinel
    // for "no bound" is "2025-12-31T22:00:00Z"). Without lifting bare
    // dates, the tagging engine fails to reconcile the value against
    // transaction StatementDate timestamps and leaves matching rows
    // untagged after check-in.
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({
        validity: { StartDate: '2024-01-01', EndDate: '2024-12-31' },
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Validity).toEqual({
      StartDate: '2024-01-01T00:00:00Z',
      EndDate: '2024-12-31T00:00:00Z',
    });
  });

  it('passes through validity bounds that already carry a time portion', () => {
    // Operator pasted a datetime, or we round-tripped a backend value
    // unchanged — leave it alone instead of double-suffixing the T.
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({
        validity: { StartDate: '2024-01-01T08:30:00Z', EndDate: null },
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Validity.StartDate).toBe('2024-01-01T08:30:00Z');
  });
});

describe('appendCondition — right-click "Add as matching rule"', () => {
  it('creates a first rule set with the filled condition when none exist', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    expect(result.current.formState.ruleGroups).toHaveLength(0);
    act(() => {
      result.current.appendCondition('AccountType', 'equals', 'bank');
    });
    const groups = result.current.formState.ruleGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0].conditions).toHaveLength(1);
    expect(groups[0].conditions[0]).toMatchObject({
      sourceField: 'AccountType',
      operation: 'equals',
      value: 'bank',
    });
  });

  it('ANDs into the LAST existing rule set (contains operation)', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => { result.current.appendCondition('AccountType', 'equals', 'bank'); });
    act(() => { result.current.addRuleGroup(); }); // a second (OR) rule set
    act(() => { result.current.appendCondition('AccountName', 'contains', 'Alinma'); });
    const groups = result.current.formState.ruleGroups;
    expect(groups).toHaveLength(2);
    // First set untouched; the new condition lands in the last set.
    expect(groups[0].conditions).toHaveLength(1);
    expect(groups[1].conditions).toHaveLength(1);
    expect(groups[1].conditions[0]).toMatchObject({
      sourceField: 'AccountName',
      operation: 'contains',
      value: 'Alinma',
    });
  });
});

describe('toTagSpecDefinition — PreExtractionTransformations round-trip', () => {
  it('emits PreExtractionTransformations when the form-state pre list is non-empty', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.addAttribute();
    });
    const attrId = result.current.formState.attributes[0].id;
    act(() => {
      result.current.updateAttribute(attrId, {
        attributeTag: 'PARTY',
        sourceField: 'Description1',
        extractionOperation: 'extract_full_field' as never,
        preExtractionTransformations: [
          { id: 'p1', method: 'trim', args: {} },
          { id: 'p2', method: 'to_uppercase', args: {} },
        ],
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Attributes[0].PreExtractionTransformations).toEqual([
      { Method: 'trim', Args: [] },
      { Method: 'to_uppercase', Args: [] },
    ]);
  });

  it('omits the PreExtractionTransformations key entirely when the form-state pre list is empty', () => {
    // Conditional-spread contract: legacy attributes don't grow an empty
    // array on the wire. Matches the existing Transformations behavior.
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.addAttribute();
    });
    const attrId = result.current.formState.attributes[0].id;
    act(() => {
      result.current.updateAttribute(attrId, {
        attributeTag: 'LEGACY',
        sourceField: 'Description1',
        extractionOperation: 'extract_full_field' as never,
        preExtractionTransformations: [],
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect('PreExtractionTransformations' in definition.Attributes[0]).toBe(false);
  });

  it('serializes transformation args as ordered Key/Value entries', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.addAttribute();
    });
    const attrId = result.current.formState.attributes[0].id;
    act(() => {
      result.current.updateAttribute(attrId, {
        attributeTag: 'X',
        sourceField: 'Description1',
        extractionOperation: 'extract_full_field' as never,
        preExtractionTransformations: [
          {
            id: 'p1',
            method: 'replace',
            args: { find: 'FOO', replaceWith: 'BAR' },
          },
        ],
      });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    const pre = definition.Attributes[0].PreExtractionTransformations!;
    expect(pre[0].Method).toBe('replace');
    expect(pre[0].Args).toEqual([
      { Key: 'find', Value: 'FOO' },
      { Key: 'replaceWith', Value: 'BAR' },
    ]);
  });
});

describe('Nickname round-trip (rebuild-from-form-state must not drop it)', () => {
  it('prefills nickname from an existing definition and re-emits it on save', () => {
    const def = mkDef({ Nickname: 'Internal deposits' });
    const { result } = renderHook(() => useWizardForm(def, undefined, undefined, mkLib()));
    expect(result.current.formState.nickname).toBe('Internal deposits');
    // Edit an UNRELATED field, then save: the nickname must survive.
    act(() => {
      result.current.updateBasicInfo({ certaintyLevelTag: 'MEDIUM' });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Nickname).toBe('Internal deposits');
  });

  it('omits Nickname from the wire when unset (pre-nickname rules stay byte-identical)', () => {
    const { result } = renderHook(() => useWizardForm(mkDef(), undefined, undefined, mkLib()));
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect('Nickname' in definition).toBe(false);
  });

  it('omits Nickname when the operator clears it on edit', () => {
    const def = mkDef({ Nickname: 'Outward clearing' });
    const { result } = renderHook(() => useWizardForm(def, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({ nickname: '   ' });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect('Nickname' in definition).toBe(false);
  });

  it('trims and emits a newly entered nickname', () => {
    const { result } = renderHook(() => useWizardForm(undefined, undefined, undefined, mkLib()));
    act(() => {
      result.current.updateBasicInfo({ tag: 'CheckIn', transactionTypeCode: '101', nickname: '  ATM deposits ' });
    });
    const { definition } = result.current.toTagSpecDefinition('lib-1');
    expect(definition.Nickname).toBe('ATM deposits');
  });
});
