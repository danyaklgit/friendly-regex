import { describe, it, expect } from 'vitest';
import { parseAttributeImport } from './importAttributeJson';

describe('parseAttributeImport', () => {
  it('rejects invalid JSON', () => {
    const r = parseAttributeImport('nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Invalid JSON/);
  });

  it('rejects a non-object payload', () => {
    expect(parseAttributeImport('[1]').ok).toBe(false);
  });

  it('errors when no recognizable fields are present', () => {
    const r = parseAttributeImport(JSON.stringify({ foo: 'bar' }));
    expect(r.ok).toBe(false);
  });

  it('reads the flat shape', () => {
    const r = parseAttributeImport(JSON.stringify({
      nameEn: 'Terminal ID', shortDescEn: 'POS terminal id',
      nameAr: 'معرف الجهاز', shortDescAr: 'وصف', possibleLovTag: 'BANKS',
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields).toEqual({
        nameEn: 'Terminal ID', shortDescEn: 'POS terminal id',
        nameAr: 'معرف الجهاز', shortDescAr: 'وصف', possibleLovTag: 'BANKS',
      });
      expect(r.warnings).toEqual([]);
    }
  });

  it('reads the backend Details[] shape', () => {
    const r = parseAttributeImport(JSON.stringify({
      PossibleLOVTag: 'COUNTRIES',
      Details: [
        { LanguageCode: 'en', Name: 'Country', ShortDescription: 'ISO country' },
        { LanguageCode: 'ar', Name: 'الدولة', ShortDescription: 'رمز' },
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.nameEn).toBe('Country');
      expect(r.fields.shortDescEn).toBe('ISO country');
      expect(r.fields.nameAr).toBe('الدولة');
      expect(r.fields.possibleLovTag).toBe('COUNTRIES');
    }
  });

  it('warns on missing required fields but still loads what is present', () => {
    const r = parseAttributeImport(JSON.stringify({ nameEn: 'Only English' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.nameEn).toBe('Only English');
      expect(r.warnings.some((w) => /Arabic name/.test(w))).toBe(true);
      expect(r.warnings.some((w) => /English short description/.test(w))).toBe(true);
    }
  });
});
