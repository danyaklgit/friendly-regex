import { describe, it, expect } from 'vitest';
import { translateFilters } from './translateFilters';
import type { FilterDefinition } from '../api/transactions';

// --- Helpers to build filter definitions ---

const listDef = (tag: string, operand: string, columns: string[]): FilterDefinition => ({
  Tag: tag,
  Label: tag,
  Type: 'LIST',
  Operand: operand,
  Values: columns.map((col) => ({ Column: col, Value: null, Label: col, Operand: null, DisabledBy: null })),
});

const listEqDef = (tag: string, values: { col: string; val: string; label: string }[]): FilterDefinition => ({
  Tag: tag,
  Label: tag,
  Type: 'LIST',
  Operand: 'EQ',
  Values: values.map((v) => ({ Column: v.col, Value: v.val, Label: v.label, Operand: null, DisabledBy: null })),
});

const searchDef = (tag: string, columns: string[]): FilterDefinition => ({
  Tag: tag,
  Label: tag,
  Type: 'SEARCH',
  Operand: 'CONTAINS',
  Values: columns.map((col) => ({ Column: col, Value: null, Label: col, Operand: null, DisabledBy: null })),
});

const rangeDef = (tag: string, type: 'DECIMAL' | 'DATE', column: string): FilterDefinition => ({
  Tag: tag,
  Label: tag,
  Type: type,
  Operand: null,
  Values: [
    { Column: column, Value: null, Label: 'From', Operand: 'GTE', DisabledBy: null },
    { Column: column, Value: null, Label: 'To', Operand: 'LTE', DisabledBy: null },
  ],
});

// --- Tests ---

describe('translateFilters', () => {
  it('returns empty array for no filters', () => {
    expect(translateFilters({}, [])).toEqual([]);
  });

  it('returns empty array for empty value sets', () => {
    const defs = [listDef('SIDE', 'IN', ['Side'])];
    expect(translateFilters({ SIDE: new Set() }, defs)).toEqual([]);
  });

  it('ignores keys with no matching definition', () => {
    expect(translateFilters({ UNKNOWN: new Set(['X']) }, [])).toEqual([]);
  });

  it('LIST + IN filter with single value', () => {
    const defs = [listDef('SIDE', 'IN', ['Side'])];
    const result = translateFilters({ SIDE: new Set(['CR']) }, defs);
    expect(result).toEqual([{ ColumnName: 'Side', Value: 'CR', Operand: 'IN' }]);
  });

  it('LIST + IN filter with multiple values produces pipe-separated value', () => {
    const defs = [listDef('SIDE', 'IN', ['Side'])];
    const result = translateFilters({ SIDE: new Set(['CR', 'DR']) }, defs);
    expect(result).toEqual([{ ColumnName: 'Side', Value: 'CR|DR', Operand: 'IN' }]);
  });

  it('LIST + EQ (SHOW ONLY style) with multiple selections sharing a value uses pipe-joined ColumnName + IN', () => {
    const defs = [
      listEqDef('SHOW ONLY', [
        { col: 'OpsIsUntagged', val: 'True', label: 'Untagged' },
        { col: 'OpsIsDeadEnd', val: 'True', label: 'Dead End' },
      ]),
    ];
    const result = translateFilters(
      { 'SHOW ONLY': new Set(['OpsIsUntagged', 'OpsIsDeadEnd']) },
      defs,
    );
    expect(result).toEqual([
      { ColumnName: 'OpsIsUntagged|OpsIsDeadEnd', Value: 'True', Operand: 'IN' },
    ]);
  });

  it('LIST + EQ with single selection', () => {
    const defs = [
      listEqDef('SHOW ONLY', [
        { col: 'OpsIsUntagged', val: 'True', label: 'Untagged' },
      ]),
    ];
    const result = translateFilters({ 'SHOW ONLY': new Set(['OpsIsUntagged']) }, defs);
    expect(result).toEqual([{ ColumnName: 'OpsIsUntagged', Value: 'True', Operand: 'EQ' }]);
  });

  it('LIST + EQ multi-select with differing Values falls back to REGEX outer-OR', () => {
    const defs = [
      listEqDef('CUSTOM_EQ', [
        { col: 'ColA', val: 'Yes', label: 'Option A' },
        { col: 'ColB', val: 'Active', label: 'Option B' },
      ]),
    ];
    const result = translateFilters({ CUSTOM_EQ: new Set(['ColA', 'ColB']) }, defs);
    expect(result).toEqual([
      {
        Operand: 'REGEX',
        Regex: [
          [{ ColumnName: 'ColA', Value: '^Yes$', Options: '' }],
          [{ ColumnName: 'ColB', Value: '^Active$', Options: '' }],
        ],
      },
    ]);
  });

  it('SEARCH filter', () => {
    const defs = [searchDef('IBAN', ['Iban'])];
    const result = translateFilters({ IBAN: new Set(['CH123']) }, defs);
    expect(result).toEqual([{ ColumnName: 'Iban', Value: 'CH123', Operand: 'CONTAINS' }]);
  });

  it('DECIMAL range filter (GTE + LTE)', () => {
    const defs = [rangeDef('AMOUNT', 'DECIMAL', 'Amount')];
    const result = translateFilters(
      { AMOUNT_GTE: new Set(['100']), AMOUNT_LTE: new Set(['500']) },
      defs,
    );
    expect(result).toEqual([
      { ColumnName: 'Amount', Value: '100', Operand: 'GTE' },
      { ColumnName: 'Amount', Value: '500', Operand: 'LTE' },
    ]);
  });

  it('DECIMAL range filter with only GTE', () => {
    const defs = [rangeDef('AMOUNT', 'DECIMAL', 'Amount')];
    const result = translateFilters({ AMOUNT_GTE: new Set(['100']) }, defs);
    expect(result).toEqual([{ ColumnName: 'Amount', Value: '100', Operand: 'GTE' }]);
  });

  it('DATE range filter', () => {
    const defs = [rangeDef('STATEMENTDATE', 'DATE', 'StatementDate')];
    const result = translateFilters(
      {
        STATEMENTDATE_GTE: new Set(['2024-01-01']),
        STATEMENTDATE_LTE: new Set(['2024-12-31']),
      },
      defs,
    );
    expect(result).toEqual([
      { ColumnName: 'StatementDate', Value: '2024-01-01', Operand: 'GTE' },
      { ColumnName: 'StatementDate', Value: '2024-12-31', Operand: 'LTE' },
    ]);
  });

  it('ignores range key (_GTE) when tag has no matching definition', () => {
    const result = translateFilters({ UNKNOWN_GTE: new Set(['100']) }, []);
    expect(result).toEqual([]);
  });

  it('ignores range key (_LTE) when tag has no matching definition', () => {
    const result = translateFilters({ UNKNOWN_LTE: new Set(['100']) }, []);
    expect(result).toEqual([]);
  });

  it('ignores range key when definition has no matching operand in Values', () => {
    // Definition exists but Values don't contain a matching GTE operand
    const def: FilterDefinition = {
      Tag: 'AMOUNT',
      Label: 'Amount',
      Type: 'DECIMAL',
      Operand: null,
      Values: [{ Column: 'Amount', Value: null, Label: 'To', Operand: 'LTE', DisabledBy: null }],
    };
    const result = translateFilters({ AMOUNT_GTE: new Set(['100']) }, [def]);
    expect(result).toEqual([]);
  });

  it('LIST + EQ skips selected columns not found in definition', () => {
    const defs = [
      listEqDef('SHOW ONLY', [
        { col: 'OpsIsUntagged', val: 'True', label: 'Untagged' },
      ]),
    ];
    const result = translateFilters(
      { 'SHOW ONLY': new Set(['OpsIsUntagged', 'NonExistentCol']) },
      defs,
    );
    expect(result).toEqual([{ ColumnName: 'OpsIsUntagged', Value: 'True', Operand: 'EQ' }]);
  });

  it('LIST + EQ uses empty string when Value is null', () => {
    const def: FilterDefinition = {
      Tag: 'FLAGS',
      Label: 'Flags',
      Type: 'LIST',
      Operand: 'EQ',
      Values: [{ Column: 'FlagA', Value: null, Label: 'Flag A', Operand: null, DisabledBy: null }],
    };
    const result = translateFilters({ FLAGS: new Set(['FlagA']) }, [def]);
    expect(result).toEqual([{ ColumnName: 'FlagA', Value: '', Operand: 'EQ' }]);
  });

  it('LIST + IN skips when Values array is empty', () => {
    const def: FilterDefinition = {
      Tag: 'EMPTY',
      Label: 'Empty',
      Type: 'LIST',
      Operand: 'IN',
      Values: [],
    };
    const result = translateFilters({ EMPTY: new Set(['val']) }, [def]);
    expect(result).toEqual([]);
  });

  it('LIST + IN falls back to "IN" when Operand is null', () => {
    const def: FilterDefinition = {
      Tag: 'SIDE',
      Label: 'Side',
      Type: 'LIST',
      Operand: null,
      Values: [{ Column: 'Side', Value: null, Label: 'Side', Operand: null, DisabledBy: null }],
    };
    const result = translateFilters({ SIDE: new Set(['CR']) }, [def]);
    expect(result).toEqual([{ ColumnName: 'Side', Value: 'CR', Operand: 'IN' }]);
  });

  it('SEARCH skips when Values array is empty', () => {
    const def: FilterDefinition = {
      Tag: 'SEARCH_EMPTY',
      Label: 'Search',
      Type: 'SEARCH',
      Operand: 'CONTAINS',
      Values: [],
    };
    const result = translateFilters({ SEARCH_EMPTY: new Set(['query']) }, [def]);
    expect(result).toEqual([]);
  });

  it('SEARCH falls back to "CONTAINS" when Operand is null', () => {
    const def: FilterDefinition = {
      Tag: 'IBAN',
      Label: 'IBAN',
      Type: 'SEARCH',
      Operand: null,
      Values: [{ Column: 'Iban', Value: null, Label: 'Iban', Operand: null, DisabledBy: null }],
    };
    const result = translateFilters({ IBAN: new Set(['CH123']) }, [def]);
    expect(result).toEqual([{ ColumnName: 'Iban', Value: 'CH123', Operand: 'CONTAINS' }]);
  });

  it('combined filters produce flat array', () => {
    const defs = [
      listDef('SIDE', 'IN', ['Side']),
      listDef('TAGS', 'IN', ['OpsTagSpecLibraryName']),
      listEqDef('SHOW ONLY', [
        { col: 'OpsIsUntagged', val: 'True', label: 'Untagged' },
      ]),
      searchDef('IBAN', ['Iban']),
      rangeDef('AMOUNT', 'DECIMAL', 'Amount'),
    ];
    const result = translateFilters(
      {
        SIDE: new Set(['CR']),
        TAGS: new Set(['A2AOut', 'TransferOut']),
        'SHOW ONLY': new Set(['OpsIsUntagged']),
        IBAN: new Set(['CH123']),
        AMOUNT_GTE: new Set(['100']),
      },
      defs,
    );
    expect(result).toHaveLength(5);
    expect(result).toContainEqual({ ColumnName: 'Side', Value: 'CR', Operand: 'IN' });
    expect(result).toContainEqual({ ColumnName: 'OpsTagSpecLibraryName', Value: 'A2AOut|TransferOut', Operand: 'IN' });
    expect(result).toContainEqual({ ColumnName: 'OpsIsUntagged', Value: 'True', Operand: 'EQ' });
    expect(result).toContainEqual({ ColumnName: 'Iban', Value: 'CH123', Operand: 'CONTAINS' });
    expect(result).toContainEqual({ ColumnName: 'Amount', Value: '100', Operand: 'GTE' });
  });
});
