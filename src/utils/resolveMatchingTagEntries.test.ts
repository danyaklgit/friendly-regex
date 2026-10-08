import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, TagSpecLibrary } from '../types';
import type { DefinitionVersionInfo } from './definitionVersions';
import { resolveMatchingTagEntries } from './resolveMatchingTagEntries';

function def(id: string, tag: string): TagSpecDefinition {
  return {
    Id: id,
    Context: [],
    Tag: tag,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: '', EndDate: '' },
    TagRuleExpressions: [],
    Attributes: [],
  };
}

function lib(id: string, status: 'ACTIVE' | 'INPROGRESS', defs: TagSpecDefinition[], activeId: string | null = null): TagSpecLibrary {
  return {
    Id: id,
    ActiveTagSpecLibId: activeId,
    OperatorId: 'op',
    StatusTag: status,
    DataSetType: 'MT940',
    Version: 1,
    VersionDate: '',
    Context: [],
    TagSpecDefinitions: defs,
  };
}

const NO_VERSIONS: ReadonlyMap<string, DefinitionVersionInfo> = new Map();

describe('resolveMatchingTagEntries', () => {
  it('returns no entries for no ids', () => {
    expect(resolveMatchingTagEntries([], [lib('a', 'ACTIVE', [def('d1', 'POSVAT')])], [], NO_VERSIONS)).toEqual([]);
  });

  it('resolves an id through the server ACTIVE copy when the editing view (draft) lacks it', () => {
    // The bug: a checked-out pair comes back as ACTIVE + INPROGRESS. The editing
    // view drops the ACTIVE copy and overlays the browser's draft cache on the
    // INPROGRESS one, so an id the cache lacks used to render "(unknown)" even
    // though the server holds it in both copies.
    const active = lib('lib-active', 'ACTIVE', [def('d1', 'POSVAT'), def('d2', 'TreasuryDebit')]);
    const draft = lib('lib-draft', 'INPROGRESS', [def('d1', 'POSVAT')], 'lib-active');
    const entries = resolveMatchingTagEntries(['d2', 'd1'], [active, draft], [draft], NO_VERSIONS);
    expect(entries.map((e) => [e.id, e.def?.Tag])).toEqual([
      ['d1', 'POSVAT'],
      ['d2', 'TreasuryDebit'],
    ]);
  });

  it('prefers the editing view definition when both hold the id (a local rename wins)', () => {
    const active = lib('lib-active', 'ACTIVE', [def('d1', 'OldName')]);
    const draft = lib('lib-draft', 'INPROGRESS', [def('d1', 'NewName')], 'lib-active');
    const entries = resolveMatchingTagEntries(['d1'], [active, draft], [draft], NO_VERSIONS);
    expect(entries[0].def?.Tag).toBe('NewName');
  });

  it('leaves an id absent from every copy unresolved and sinks it to the bottom', () => {
    const active = lib('lib-active', 'ACTIVE', [def('d1', 'Zebra'), def('d2', 'alpha')]);
    const entries = resolveMatchingTagEntries(['ghost', 'd1', 'd2'], [active], [active], NO_VERSIONS);
    expect(entries.map((e) => e.id)).toEqual(['d2', 'd1', 'ghost']);
    expect(entries[2].def).toBeUndefined();
  });

  it('attaches the version overlay by id', () => {
    const active = lib('lib-active', 'ACTIVE', [def('d1', 'POSVAT'), def('d2', 'POSVAT')]);
    const versions = new Map<string, DefinitionVersionInfo>([
      ['d1', { version: 1, total: 2 }],
      ['d2', { version: 2, total: 2 }],
    ]);
    // Same tag name on both: the name sort ties, so input order is kept.
    const entries = resolveMatchingTagEntries(['d1', 'd2'], [active], [active], versions);
    expect(entries.map((e) => [e.id, e.version])).toEqual([
      ['d1', 1],
      ['d2', 2],
    ]);
  });
});
