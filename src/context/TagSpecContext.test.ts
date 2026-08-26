import { describe, it, expect } from 'vitest';
import type { ContextEntry, TagSpecDefinition, TagSpecLibrary } from '../types';
import { tagSpecReducer } from './TagSpecContext';

function ctx(bank: string, side: string): ContextEntry[] {
  return [
    { Key: 'BankSwiftCode', Value: bank },
    { Key: 'Side', Value: side },
  ];
}

function def(id: string, tag: string): TagSpecDefinition {
  return {
    Id: id,
    Tag: tag,
    Context: [],
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [],
    Attributes: [],
  };
}

function lib(
  id: string,
  dataSetType: string,
  context: ContextEntry[],
  status: TagSpecLibrary['StatusTag'],
  defs: TagSpecDefinition[] = [],
): TagSpecLibrary {
  return {
    Id: id,
    ActiveTagSpecLibId: null,
    OperatorId: 'op-1',
    StatusTag: status,
    DataSetType: dataSetType,
    Version: 1,
    IsLatestVersion: true,
    VersionDate: '2026-08-26',
    Context: context,
    TagSpecDefinitions: defs,
  };
}

const RJHI_CR = ctx('RJHISARI', 'CR');

describe('tagSpecReducer ADD', () => {
  it('files the definition under the library matching DataSetType + context, not just context (definition-lost-on-check-in bug)', () => {
    // The bug precondition: TWO INPROGRESS drafts for the same bank/side in
    // different workspaces, with the WRONG one (MT940) first in state order.
    const state = [
      lib('mt940-draft', 'MT940', RJHI_CR, 'INPROGRESS', [def('d-old', 'CheckIn')]),
      lib('mt942-draft', 'MT942', RJHI_CR, 'INPROGRESS', [def('d-msc', 'TransferInInstant')]),
    ];
    const newDef = def('d-new', 'TransferInInstant');
    const next = tagSpecReducer(state, {
      type: 'ADD',
      payload: { parentContext: RJHI_CR, dataSetType: 'MT942', definition: newDef },
    });
    expect(next.find((l) => l.Id === 'mt942-draft')!.TagSpecDefinitions.map((d) => d.Id))
      .toEqual(['d-msc', 'd-new']);
    expect(next.find((l) => l.Id === 'mt940-draft')!.TagSpecDefinitions.map((d) => d.Id))
      .toEqual(['d-old']);
  });

  it('prefers the INPROGRESS library over an ACTIVE one of the same identity', () => {
    const state = [
      lib('active', 'MT942', RJHI_CR, 'ACTIVE', []),
      lib('draft', 'MT942', RJHI_CR, 'INPROGRESS', []),
    ];
    const next = tagSpecReducer(state, {
      type: 'ADD',
      payload: { parentContext: RJHI_CR, dataSetType: 'MT942', definition: def('d1', 'T') },
    });
    expect(next.find((l) => l.Id === 'draft')!.TagSpecDefinitions).toHaveLength(1);
    expect(next.find((l) => l.Id === 'active')!.TagSpecDefinitions).toHaveLength(0);
  });

  it('creates a new library carrying the payload DataSetType when nothing matches', () => {
    const state = [lib('other', 'MT940', ctx('SABBSARI', 'DR'), 'ACTIVE')];
    const next = tagSpecReducer(state, {
      type: 'ADD',
      payload: { parentContext: RJHI_CR, dataSetType: 'MT942', definition: def('d1', 'T') },
    });
    expect(next).toHaveLength(2);
    const created = next.find((l) => l.Id !== 'other')!;
    expect(created.DataSetType).toBe('MT942');
    expect(created.Context).toEqual(RJHI_CR);
    expect(created.TagSpecDefinitions.map((d) => d.Id)).toEqual(['d1']);
  });
});

describe('tagSpecReducer UPDATE', () => {
  it('updates in place only when DataSetType AND context match the current library', () => {
    const state = [
      lib('mt942-draft', 'MT942', RJHI_CR, 'INPROGRESS', [def('d1', 'T')]),
    ];
    const updated = { ...def('d1', 'T-renamed') };
    const next = tagSpecReducer(state, {
      type: 'UPDATE',
      payload: { parentContext: RJHI_CR, dataSetType: 'MT942', definition: updated },
    });
    expect(next.find((l) => l.Id === 'mt942-draft')!.TagSpecDefinitions[0].Tag).toBe('T-renamed');
  });

  it('moves the definition to the library matching DataSetType + context, skipping a same-context library of another workspace', () => {
    const state = [
      lib('mt940-draft', 'MT940', RJHI_CR, 'INPROGRESS', [def('misplaced', 'T'), def('keep', 'K')]),
      lib('mt942-draft', 'MT942', RJHI_CR, 'INPROGRESS', []),
    ];
    const next = tagSpecReducer(state, {
      type: 'UPDATE',
      payload: { parentContext: RJHI_CR, dataSetType: 'MT942', definition: def('misplaced', 'T') },
    });
    expect(next.find((l) => l.Id === 'mt940-draft')!.TagSpecDefinitions.map((d) => d.Id)).toEqual(['keep']);
    expect(next.find((l) => l.Id === 'mt942-draft')!.TagSpecDefinitions.map((d) => d.Id)).toEqual(['misplaced']);
  });
});

describe('tagSpecReducer REPLACE_LIBRARY', () => {
  it('swaps the library with the matching Id and touches nothing else', () => {
    const state = [
      lib('a', 'MT940', RJHI_CR, 'INPROGRESS', [def('d1', 'T')]),
      lib('b', 'MT942', RJHI_CR, 'INPROGRESS', [def('d2', 'U')]),
    ];
    const replacement = lib('b', 'MT942', RJHI_CR, 'INPROGRESS', [def('d2', 'U'), def('d3', 'V')]);
    const next = tagSpecReducer(state, { type: 'REPLACE_LIBRARY', payload: replacement });
    expect(next.find((l) => l.Id === 'b')!.TagSpecDefinitions.map((d) => d.Id)).toEqual(['d2', 'd3']);
    expect(next.find((l) => l.Id === 'a')).toBe(state[0]);
  });
});
