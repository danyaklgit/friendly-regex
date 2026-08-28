import { describe, it, expect } from 'vitest';
import { parseTagImport } from './importTagJson';

describe('parseTagImport', () => {
  it('rejects invalid JSON and non-objects', () => {
    expect(parseTagImport('nope').ok).toBe(false);
    expect(parseTagImport('[1]').ok).toBe(false);
  });

  it('errors when nothing recognizable is present', () => {
    expect(parseTagImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('reads a flat tag payload with groups', () => {
    const r = parseTagImport(JSON.stringify({
      tag: 'TransferOut', level: 'T',
      nameEn: 'Outbound Transfer', descriptionEn: 'Money leaving the account',
      nameAr: 'تحويل صادر', descriptionAr: 'وصف',
      parentTag: 'Transfers', groups: ['OUTBOUND', 'PAYROLL'],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.tag).toBe('TransferOut');
      expect(r.fields.level).toBe('T');
      expect(r.fields.nameEn).toBe('Outbound Transfer');
      expect(r.fields.nameAr).toBe('تحويل صادر');
      expect(r.fields.parentTag).toBe('Transfers');
      expect(r.fields.groups).toEqual(['OUTBOUND', 'PAYROLL']);
      expect(r.warnings).toEqual([]);
    }
  });

  it('defaults level to T and reads Details[]', () => {
    const r = parseTagImport(JSON.stringify({
      tag: 'FEE',
      Details: [
        { LanguageCode: 'en', Name: 'Bank Fee', Description: 'Charged fee' },
        { LanguageCode: 'ar', Name: 'رسوم', Description: 'وصف' },
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.level).toBe('T');
      expect(r.fields.nameEn).toBe('Bank Fee');
      expect(r.fields.nameAr).toBe('رسوم');
    }
  });

  it('errors on an invalid level', () => {
    const r = parseTagImport(JSON.stringify({ tag: 'X', level: 'Z' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /level/.test(e))).toBe(true);
  });

  it('warns when a group carries parent/groups', () => {
    const r = parseTagImport(JSON.stringify({ tag: 'INBOUND', level: 'G', groups: ['X'] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => /level "G"/.test(w))).toBe(true);
  });

  it('warns on an empty tag code', () => {
    const r = parseTagImport(JSON.stringify({ nameEn: 'Only a name' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => /Tag Code/.test(w))).toBe(true);
  });
});
