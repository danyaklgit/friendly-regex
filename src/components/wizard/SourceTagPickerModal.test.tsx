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
  opts: { bank?: string; side?: string; dataSetType?: string } = {},
): TagSpecLibrary {
  const bank = opts.bank ?? 'ARNBSARI';
  const side = opts.side ?? 'CR';
  const dataSetType = opts.dataSetType ?? 'MT940';
  return {
    Id: `lib-${status}-${version}-${dataSetType}-${bank}-${side}`,
    ActiveTagSpecLibId: null,
    OperatorId: 'op-1',
    StatusTag: status,
    DataSetType: dataSetType,
    Version: version,
    IsLatestVersion: true,
    VersionDate: '2026-01-01',
    Context: [
      { Key: 'BankSwiftCode', Value: bank },
      { Key: 'Side', Value: side },
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

describe('SourceTagPickerModal — bank scoping + relevance for intraday cloning', () => {
  const gulfDef = makeDef('g1', 'GULF_TAG', 1, 1);
  const arnbDef = makeDef('a1', 'ARNB_TAG', 1, 1);
  const libs = [
    makeLib('ACTIVE', 1, [gulfDef], { bank: 'GULFSARI', side: 'CR' }),
    makeLib('ACTIVE', 1, [arnbDef], { bank: 'ARNBSARI', side: 'CR' }),
  ];

  it('defaults to the current bank and reveals the rest via "Show all banks"', () => {
    render(
      <SourceTagPickerModal
        open
        libraries={libs}
        onClose={() => {}}
        onSelect={() => {}}
        currentBank="GULFSARI"
        currentSide="CR"
        currentDataSetType="MT942"
      />,
    );
    // Scoped to GULFSARI: the other bank's tag is hidden until "Show all".
    expect(screen.getByText('GULF_TAG')).toBeTruthy();
    expect(screen.queryByText('ARNB_TAG')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all banks' }));
    expect(screen.getByText('ARNB_TAG')).toBeTruthy();
  });

  it('ranks MT940 same-bank/side rules first (the intraday clone source)', () => {
    const alpha = makeDef('m1', 'ALPHA_DR', 1, 1); // MT940 · GULFSARI · DR  (best)
    const beta = makeDef('m2', 'BETA_DR', 1, 1); //  MT942 · GULFSARI · DR
    const gamma = makeDef('m3', 'GAMMA_CR', 1, 1); // MT940 · GULFSARI · CR
    const rankLibs = [
      makeLib('ACTIVE', 1, [gamma], { bank: 'GULFSARI', side: 'CR', dataSetType: 'MT940' }),
      makeLib('ACTIVE', 1, [beta], { bank: 'GULFSARI', side: 'DR', dataSetType: 'MT942' }),
      makeLib('ACTIVE', 1, [alpha], { bank: 'GULFSARI', side: 'DR', dataSetType: 'MT940' }),
    ];
    render(
      <SourceTagPickerModal
        open
        libraries={rankLibs}
        onClose={() => {}}
        onSelect={() => {}}
        currentBank="GULFSARI"
        currentSide="DR"
        currentDataSetType="MT942"
      />,
    );
    const inOrder = screen.getAllByText(/^(ALPHA_DR|BETA_DR|GAMMA_CR)$/).map((el) => el.textContent);
    // same bank+side+MT940 → same bank+side → same bank+MT940 (other side).
    expect(inOrder).toEqual(['ALPHA_DR', 'BETA_DR', 'GAMMA_CR']);
  });
});
