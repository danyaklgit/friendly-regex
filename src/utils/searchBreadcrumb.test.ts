import { describe, it, expect } from 'vitest';
import { buildBreadcrumb, breadcrumbToString } from './searchBreadcrumb';
import type { TagSpecLibrary } from '../types/tagSpec';

function makeLibrary(id: string, bank: string, side: string, defs: { Id: string; Tag: string }[] = []): TagSpecLibrary {
  return {
    Id: id,
    ActiveTagSpecLibId: null,
    OperatorId: '',
    StatusTag: 'ACTIVE',
    DataSetType: 'MT940',
    Version: 1,
    VersionDate: '2025-01-01',
    Context: [
      { Key: 'BankSwiftCode', Value: bank },
      { Key: 'Side', Value: side },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TagSpecDefinitions: defs.map((d) => ({ Id: d.Id, Tag: d.Tag } as any)),
  };
}

describe('buildBreadcrumb', () => {
  it('resolves bank and side from a library-only target', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR');
    const crumb = buildBreadcrumb(
      { TagSpecLibraryId: 'lib-1' },
      new Map([['lib-1', lib]]),
    );
    expect(crumb).toEqual({
      bank: 'CITI',
      side: 'CR',
      tagName: null,
      scope: null,
      libraryMissing: false,
      definitionMissing: false,
    });
  });

  it('resolves the tag name when a definition id is set', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR', [{ Id: 'def-1', Tag: 'SWIFT_TRANSFER' }]);
    const crumb = buildBreadcrumb(
      { TagSpecLibraryId: 'lib-1', TagSpecDefinitionId: 'def-1' },
      new Map([['lib-1', lib]]),
    );
    expect(crumb.tagName).toBe('SWIFT_TRANSFER');
    expect(crumb.definitionMissing).toBe(false);
  });

  it('flags definitionMissing when the def id is set but not present', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR', []);
    const crumb = buildBreadcrumb(
      { TagSpecLibraryId: 'lib-1', TagSpecDefinitionId: 'def-x' },
      new Map([['lib-1', lib]]),
    );
    expect(crumb.tagName).toBeNull();
    expect(crumb.definitionMissing).toBe(true);
  });

  it('flags libraryMissing when the library is not in the lookup', () => {
    const crumb = buildBreadcrumb(
      { TagSpecLibraryId: 'lib-unknown' },
      new Map(),
    );
    expect(crumb.libraryMissing).toBe(true);
    expect(crumb.bank).toBeNull();
    expect(crumb.side).toBeNull();
  });

  it('AttributeTag takes precedence over TagRuleExpressionId for scope', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR');
    const crumb = buildBreadcrumb(
      {
        TagSpecLibraryId: 'lib-1',
        TagRuleExpressionId: 'rule-1',
        AttributeTag: 'Amount',
      },
      new Map([['lib-1', lib]]),
    );
    expect(crumb.scope).toBe('Attr: Amount');
  });

  it('uses "Rule" as scope when only TagRuleExpressionId is set', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR');
    const crumb = buildBreadcrumb(
      { TagSpecLibraryId: 'lib-1', TagRuleExpressionId: 'rule-1' },
      new Map([['lib-1', lib]]),
    );
    expect(crumb.scope).toBe('Rule');
  });
});

describe('breadcrumbToString', () => {
  it('joins bank/side, tag name, and scope with " · "', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR', [{ Id: 'def-1', Tag: 'SWIFT' }]);
    const target = {
      TagSpecLibraryId: 'lib-1',
      TagSpecDefinitionId: 'def-1',
      AttributeTag: 'Amount',
    };
    const crumb = buildBreadcrumb(target, new Map([['lib-1', lib]]));
    expect(breadcrumbToString(crumb, target)).toBe('CITI · CR · SWIFT · Attr: Amount');
  });

  it('falls back to truncated library id when library is missing', () => {
    const target = { TagSpecLibraryId: '64f1a2b3c4d5e6f7a8b9c0d1' };
    const crumb = buildBreadcrumb(target, new Map());
    expect(breadcrumbToString(crumb, target)).toBe('64f1a2…');
  });

  it('falls back to truncated definition id when definition is missing', () => {
    const lib = makeLibrary('lib-1', 'CITI', 'CR', []);
    const target = {
      TagSpecLibraryId: 'lib-1',
      TagSpecDefinitionId: '64f1a2b3c4d5e6f7a8b9c0d2',
    };
    const crumb = buildBreadcrumb(target, new Map([['lib-1', lib]]));
    expect(breadcrumbToString(crumb, target)).toBe('CITI · CR · 64f1a2…');
  });
});
