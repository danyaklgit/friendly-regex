import { describe, it, expect } from 'vitest';
import type { LOVList } from '../../types/lov';
import { getDemoCompanies } from './getDemoCompanies';

function list(items: Array<{ value: string; name: string; tags: string[] }>): LOVList {
  return {
    Tag: 'DEMO_USER_COMPS',
    Name: 'Demo User Companies',
    Items: items.map((i) => ({
      StatusTag: 'ACTIVE',
      StatusName: 'Active',
      Value: i.value,
      Name: i.name,
      Description: i.name,
      Tags: i.tags,
    })),
  };
}

describe('getDemoCompanies', () => {
  it('returns [] when the DEMO_USER_COMPS LOV is absent', () => {
    expect(getDemoCompanies([])).toEqual([]);
    expect(getDemoCompanies([{ Tag: 'SOMETHING_ELSE', Name: '', Items: [] }])).toEqual([]);
  });

  it('maps Items[].Tags into the ibans field', () => {
    const out = getDemoCompanies([
      list([
        { value: 'BCG', name: 'Business Council Gulf', tags: ['SA6810000062513547000100', 'SA0910000062500000112209'] },
      ]),
    ]);
    expect(out).toEqual([
      {
        value: 'BCG',
        name: 'Business Council Gulf',
        ibans: ['SA6810000062513547000100', 'SA0910000062500000112209'],
      },
    ]);
  });

  it('filters out companies that have no IBANs', () => {
    const out = getDemoCompanies([
      list([
        { value: 'KEEP', name: 'Keep', tags: ['SA1'] },
        { value: 'DROP', name: 'Drop', tags: [] },
      ]),
    ]);
    expect(out.map((c) => c.value)).toEqual(['KEEP']);
  });

  it('drops empty / non-string entries from the Tags array', () => {
    const malformed: LOVList = {
      Tag: 'DEMO_USER_COMPS',
      Name: 'x',
      Items: [
        {
          StatusTag: 'ACTIVE',
          StatusName: 'Active',
          Value: 'X',
          Name: 'X',
          Tags: ['', 'SA1', null as unknown as string, 'SA2'],
        },
      ],
    };
    expect(getDemoCompanies([malformed])[0]?.ibans).toEqual(['SA1', 'SA2']);
  });
});
