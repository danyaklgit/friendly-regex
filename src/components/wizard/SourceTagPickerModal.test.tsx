import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TagSpecDefinition, TagSpecLibrary } from '../../types';
import { regexify } from '../../utils/regexify';
import { SourceTagPickerModal } from './SourceTagPickerModal';

function makeCondition(field: string, value: string) {
  return {
    SourceField: field,
    ExpressionPrompt: null,
    ExpressionId: null,
    Regex: regexify('contains', value),
    RegexDetails: [],
  };
}

function makeDef(
  id: string,
  tag: string,
  ruleSetCount: number,
  attrCount: number,
): TagSpecDefinition {
  return {
    Id: id,
    Context: [{ Key: 'TransactionTypeCode', Value: 'TRF' }],
    Tag: tag,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: Array.from({ length: ruleSetCount }, (_, i) => [
      makeCondition('NarrativeText', `V${i}`),
    ]),
    Attributes: Array.from({ length: attrCount }, (_, i) => ({
      AttributeTag: `ATTR_${i}`,
      IsMandatory: false,
      LOVTag: null,
      ValidationRuleTag: '',
      AttributeRuleExpression: {
        SourceField: 'NarrativeText',
        ExpressionPrompt: null,
        ExpressionId: null,
        Regex: regexify('contains', `A${i}`),
        RegexDetails: [],
      },
      Transformations: [],
    })),
  };
}

function makeLib(
  status: TagSpecLibrary['StatusTag'],
  version: number,
  defs: TagSpecDefinition[],
): TagSpecLibrary {
  return {
    Id: `lib-${status}-${version}`,
    ActiveTagSpecLibId: null,
    OperatorId: 'op-1',
    StatusTag: status,
    DataSetType: 'MT940',
    Version: version,
    IsLatestVersion: true,
    VersionDate: '2026-01-01',
    Context: [
      { Key: 'BankSwiftCode', Value: 'ARNBSARI' },
      { Key: 'Side', Value: 'CR' },
    ],
    TagSpecDefinitions: defs,
  };
}

describe('SourceTagPickerModal — most-current version preference', () => {
  // Same def.Id in an ACTIVE (stale) and an INPROGRESS (current) library.
  // ACTIVE listed FIRST so a naive first-wins dedup would pick the stale copy.
  const DEF_ID = 'shared-def-id';
  const activeDef = makeDef(DEF_ID, 'A2AIn', 1, 1); // 1 rule set · 1 attribute
  const inProgressDef = makeDef(DEF_ID, 'A2AIn', 2, 3); // 2 rule sets · 3 attributes
  const libraries = [
    makeLib('ACTIVE', 1, [activeDef]),
    makeLib('INPROGRESS', 1, [inProgressDef]),
  ];

  it('shows the INPROGRESS version once, not the ACTIVE snapshot', () => {
    render(
      <SourceTagPickerModal open libraries={libraries} onClose={() => {}} onSelect={() => {}} />,
    );
    // Deduped to a single entry, carrying the in-progress counts.
    expect(screen.getAllByText('A2AIn')).toHaveLength(1);
    expect(screen.getByText(/2 rule sets · 3 attributes/)).toBeTruthy();
    expect(screen.queryByText(/1 rule set · 1 attribute/)).toBeNull();
  });

  it('duplicates from the INPROGRESS definition when selected', () => {
    const onSelect = vi.fn();
    render(
      <SourceTagPickerModal open libraries={libraries} onClose={() => {}} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('A2AIn'));
    fireEvent.click(screen.getByRole('button', { name: 'Use This Tag' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as TagSpecDefinition;
    expect(picked.Id).toBe(DEF_ID);
    // The in-progress copy has 2 rule sets + 3 attributes; the active one had 1/1.
    expect(picked.TagRuleExpressions).toHaveLength(2);
    expect(picked.Attributes).toHaveLength(3);
  });
});
