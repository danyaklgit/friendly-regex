import { describe, it, expect } from 'vitest';
import { parseLovImport } from './importLovJson';

describe('parseLovImport', () => {
  it('rejects invalid JSON and non-object payloads', () => {
    expect(parseLovImport('not json').ok).toBe(false);
    expect(parseLovImport('[1,2]').ok).toBe(false);
    expect(parseLovImport('{}').ok).toBe(false);
  });

  it('parses the flat shape with items', () => {
    const r = parseLovImport(JSON.stringify({
      tag: 'MY_BILLERS',
      nameEn: 'My billers',
      descEn: 'Custom biller grouping',
      nameAr: 'قوائمي',
      items: [
        { value: '001', tags: ['001', 'STC'], nameEn: 'Saudi Telecom', nameAr: 'الاتصالات' },
        { value: '002', nameEn: 'Electric Co' },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.tag).toBe('MY_BILLERS');
    expect(r.fields.nameEn).toBe('My billers');
    expect(r.fields.nameAr).toBe('قوائمي');
    expect(r.fields.items).toHaveLength(2);
    expect(r.fields.items[0]).toEqual({ value: '001', tags: ['001', 'STC'], nameEn: 'Saudi Telecom', descEn: '', nameAr: 'الاتصالات', descAr: '' });
    expect(r.fields.items[1].tags).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('parses the backend-ish shape (Tag / Details / Items with Details)', () => {
    const r = parseLovImport(JSON.stringify({
      Tag: 'CARD_TYPES',
      Details: [
        { LanguageCode: 'en', Name: 'Card Types', ShortDescription: 'POS card schemes' },
        { LanguageCode: 'ar', Name: 'أنواع البطاقات', ShortDescription: '' },
      ],
      Items: [
        { Value: 'MC', Tags: ['MC'], Details: [{ LanguageCode: 'en', Name: 'Mastercard', ShortDescription: '' }] },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.nameEn).toBe('Card Types');
    expect(r.fields.nameAr).toBe('أنواع البطاقات');
    expect(r.fields.items[0]).toMatchObject({ value: 'MC', tags: ['MC'], nameEn: 'Mastercard' });
  });

  it('warns on missing tag/name, skips valueless items, dedupes item values', () => {
    const r = parseLovImport(JSON.stringify({
      items: [
        { value: 'A', nameEn: 'First' },
        { nameEn: 'no value' },
        { value: 'a', nameEn: 'dupe of A' },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.items).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('tag'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('nameEn'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('skipped'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('duplicate value'))).toBe(true);
  });

  it('accepts comma-separated string tags on items', () => {
    const r = parseLovImport(JSON.stringify({ tag: 'X', nameEn: 'X', items: [{ value: 'V', tags: 'a, b; c' }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.items[0].tags).toEqual(['a', 'b', 'c']);
  });
});
