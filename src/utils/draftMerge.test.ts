import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, TagSpecLibrary } from '../types';
import { mergeDraftWithServer } from './draftMerge';

function def(id: string, overrides: Partial<TagSpecDefinition> = {}): TagSpecDefinition {
  return {
    Id: id,
    Context: [],
    Tag: `TAG_${id.toUpperCase()}`,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: '2026-01-01T00:00:00Z', EndDate: null },
    TagRuleExpressions: [[{ SourceField: 'Description1', ExpressionPrompt: null, ExpressionId: null, Regex: `^${id}`, RegexDetails: [] }]],
    Attributes: [],
    ...overrides,
  } as TagSpecDefinition;
}

function lib(defs: TagSpecDefinition[], overrides: Partial<TagSpecLibrary> = {}): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: 'lib-0',
    OperatorId: 'op-1',
    StatusTag: 'INPROGRESS',
    DataSetType: 'MT940',
    Version: 3,
    VersionDate: '2026-09-01',
    Context: [
      { Key: 'BankSwiftCode', Value: 'SABBSARI' },
      { Key: 'Side', Value: 'CR' },
    ],
    TagSpecDefinitions: defs,
    ...overrides,
  };
}

describe('mergeDraftWithServer', () => {
  it('takes the API library when there is no draft or no baseline anchor', () => {
    const api = lib([def('a')]);
    expect(mergeDraftWithServer(api, null, null).merged).toBe(api);
    expect(mergeDraftWithServer(api, null, lib([def('a'), def('b')])).merged).toBe(api);
    expect(mergeDraftWithServer(api, lib([def('a')]), null).merged).toBe(api);
  });

  it('lets a server-authored field through when the definition is locally untouched (the Nickname migration)', () => {
    const base = def('a'); // cached before the migration: no nickname
    const api = lib([{ ...def('a'), Nickname: 'Salary variant', SrvSavedRev: 200 }]);
    const { merged, hasPendingEdits } = mergeDraftWithServer(api, lib([{ ...base, SrvSavedRev: 100 }]), lib([{ ...base, SrvSavedRev: 100 }]));
    expect(merged.TagSpecDefinitions[0].Nickname).toBe('Salary variant');
    expect(merged.TagSpecDefinitions[0].SrvSavedRev).toBe(200);
    expect(hasPendingEdits).toBe(false);
  });

  it('keeps a pending local edit over the API copy for that definition only', () => {
    const edited = { ...def('a'), CertaintyLevelTag: 'LOW' as const };
    const api = lib([
      { ...def('a'), SrvSavedRev: 100 },
      { ...def('b'), Nickname: 'From another window', SrvSavedRev: 300 },
    ]);
    const { merged, hasPendingEdits } = mergeDraftWithServer(
      api,
      lib([def('a'), def('b')]),
      lib([edited, def('b')]),
    );
    expect(merged.TagSpecDefinitions[0].CertaintyLevelTag).toBe('LOW');
    // The untouched sibling still receives the server's change.
    expect(merged.TagSpecDefinitions[1].Nickname).toBe('From another window');
    expect(hasPendingEdits).toBe(true);
  });

  it('keeps pending local adds and appends them after the API list', () => {
    const added = def('new');
    const api = lib([def('a')]);
    const { merged, hasPendingEdits } = mergeDraftWithServer(api, lib([def('a')]), lib([def('a'), added]));
    expect(merged.TagSpecDefinitions.map((d) => d.Id)).toEqual(['a', 'new']);
    expect(hasPendingEdits).toBe(true);
  });

  it('keeps a pending local delete while the server copy is unchanged', () => {
    const api = lib([def('a'), { ...def('b'), SrvSavedRev: 100 }]);
    const { merged, hasPendingEdits, resurrectedTags } = mergeDraftWithServer(
      api,
      lib([def('a'), { ...def('b'), SrvSavedRev: 100 }]),
      lib([def('a')]), // b deleted locally
    );
    expect(merged.TagSpecDefinitions.map((d) => d.Id)).toEqual(['a']);
    expect(hasPendingEdits).toBe(true);
    expect(resurrectedTags).toEqual([]);
  });

  it('cancels a pending delete when the server changed the definition meanwhile (by stamp)', () => {
    const api = lib([def('a'), { ...def('b'), Nickname: 'Edited elsewhere', SrvSavedRev: 200 }]);
    const { merged, resurrectedTags } = mergeDraftWithServer(
      api,
      lib([def('a'), { ...def('b'), SrvSavedRev: 100 }]),
      lib([def('a')]), // b deleted locally — but the server moved it to rev 200
    );
    expect(merged.TagSpecDefinitions.map((d) => d.Id)).toEqual(['a', 'b']);
    expect(resurrectedTags).toEqual(['TAG_B']);
  });

  it('cancels a pending delete on content change when stamps are absent (pre-deploy rows)', () => {
    const api = lib([{ ...def('b'), Nickname: 'Edited elsewhere' }]);
    const { merged, resurrectedTags } = mergeDraftWithServer(api, lib([def('b')]), lib([]));
    expect(merged.TagSpecDefinitions.map((d) => d.Id)).toEqual(['b']);
    expect(resurrectedTags).toEqual(['TAG_B']);
  });

  it('lets a server-side delete win, even over a pending local edit of the deleted definition', () => {
    const api = lib([def('a')]); // server deleted b
    const { merged } = mergeDraftWithServer(
      api,
      lib([def('a'), def('b')]),
      lib([def('a'), { ...def('b'), CertaintyLevelTag: 'LOW' as const }]),
    );
    expect(merged.TagSpecDefinitions.map((d) => d.Id)).toEqual(['a']);
  });

  it('reports no pending edits when draft and baseline agree, so re-anchoring clears hasChanges', () => {
    const snapshot = lib([{ ...def('a'), SrvSavedRev: 100 }]);
    const api = lib([{ ...def('a'), Nickname: 'Migrated', SrvSavedRev: 200 }], { LastUpdatedDate: '2026-09-09T17:00:00Z' });
    const { merged, hasPendingEdits } = mergeDraftWithServer(api, snapshot, snapshot);
    expect(hasPendingEdits).toBe(false);
    // With no pending edits the merged library serializes identically to the
    // API library — the anchors converge and hasChanges reads false.
    expect(JSON.stringify(merged)).toBe(JSON.stringify(api));
  });

  it('takes the API copy when a definition has no baseline anchor (legacy cache shape)', () => {
    // In current AND in the API but missing from the baseline: cannot tell an
    // edit from a server change — server truth wins.
    const api = lib([{ ...def('a'), Nickname: 'Server', SrvSavedRev: 300 }]);
    const { merged, hasPendingEdits } = mergeDraftWithServer(
      api,
      lib([]),
      lib([{ ...def('a'), Nickname: 'Cached' }]),
    );
    expect(merged.TagSpecDefinitions[0].Nickname).toBe('Server');
    expect(hasPendingEdits).toBe(false);
  });
});
