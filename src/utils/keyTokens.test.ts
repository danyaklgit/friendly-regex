import { describe, it, expect } from 'vitest';
import type { KeyToken } from '../api/sampling';
import {
  KEY_FIELD_LABELS,
  isBuiltinPlaceholder,
  listTagPhrase,
  tokenPhrase,
  tokenCode,
  humanizeKeyTokens,
  replaceTokenAt,
  removeTokenAt,
  splitLiteralToken,
  locateSelectionInTokens,
  alignTokensToExample,
  tokensPinSomething,
  tokensEqual,
} from './keyTokens';

const lit = (text: string, field: KeyToken['Field'] = 'AI', glued = false): KeyToken => ({
  Field: field, Kind: 'Literal', Text: text, Item: null, Glued: glued,
});
const ph = (text: string, field: KeyToken['Field'] = 'AI', glued = false): KeyToken => ({
  Field: field, Kind: 'Placeholder', Text: text, Item: null, Glued: glued,
});
const list = (tag: string, item: string | null = null, field: KeyToken['Field'] = 'AI'): KeyToken => ({
  Field: field, Kind: 'List', Text: tag, Item: item, Glued: false,
});

describe('placeholder vocabulary', () => {
  it('knows the built-ins plus the legacy NUM synonym', () => {
    for (const p of ['IBAN', 'SA_IBAN', 'SA_IBAN_INTRA', 'DATE', 'TIME', 'CURRENCY', 'DECIMAL', 'INT', 'AR', 'NAME', 'STRING', 'NUM']) {
      expect(isBuiltinPlaceholder(p)).toBe(true);
    }
    expect(isBuiltinPlaceholder('BANKS')).toBe(false);
  });
  it('separates the IBAN family (2026-09-08 split)', () => {
    expect(tokenPhrase(ph('IBAN'))).toBe('a foreign IBAN');
    expect(tokenPhrase(ph('SA_IBAN_INTRA'))).toContain('own');
    expect(tokenPhrase(ph('SA_IBAN'))).toContain('another Saudi bank');
  });
  it('NUM reads the same as INT', () => {
    expect(tokenPhrase(ph('NUM'))).toBe(tokenPhrase(ph('INT')));
    expect(tokenPhrase(ph('INT'))).toBe('a number');
  });
  it('labels all four key fields (D1/TD fallback fields, 2026-09-08)', () => {
    expect(KEY_FIELD_LABELS.AI).toBe('Additional Information');
    expect(KEY_FIELD_LABELS.D2).toBe('Description 2');
    expect(KEY_FIELD_LABELS.D1).toBe('Description 1');
    expect(KEY_FIELD_LABELS.TD).toBe('Transaction details');
  });
});

describe('listTagPhrase', () => {
  it('humanizes list tags into singular phrases', () => {
    expect(listTagPhrase('BANKS')).toBe('a bank');
    expect(listTagPhrase('COUNTRIES')).toBe('a country');
    expect(listTagPhrase('SADAD_BILLERS')).toBe('a sadad biller');
  });
});

describe('tokenPhrase', () => {
  it('shows keep-item lists as the item itself', () => {
    expect(tokenPhrase(list('CARD_TYPES', 'Visa'))).toBe('Visa');
    expect(tokenPhrase(list('PAYMENT_CHANNELS', 'POS_Terminal'))).toBe('POS Terminal');
  });
  it('shows collapse lists as the list phrase and literals verbatim', () => {
    expect(tokenPhrase(list('BANKS'))).toBe('a bank');
    expect(tokenPhrase(lit('FAVOR'))).toBe('FAVOR');
  });
});

describe('tokenCode', () => {
  it('renders chips in the token grammar', () => {
    expect(tokenCode(lit('FAVOR'))).toBe('FAVOR');
    expect(tokenCode(list('BANKS'))).toBe('<BANKS>');
    expect(tokenCode(list('CARD_TYPES', 'Visa'))).toBe('<CARD_TYPES:Visa>');
    expect(tokenCode(ph('AR'))).toBe('<AR>');
  });
});

describe('alignTokensToExample', () => {
  it('recovers the words each placeholder stands for', () => {
    const tokens = [lit('/BULK SARIE PAYMENTS/'), list('BANKS'), lit('REF'), ph('INT')];
    const hit = alignTokensToExample(tokens, 'AI', '/BULK SARIE PAYMENTS/ RIYAD BANK REF 12345');
    expect(hit).not.toBeNull();
    expect(hit!.get(1)).toBe('RIYAD BANK');
    expect(hit!.get(3)).toBe('12345');
  });
  it('handles glued placeholders (ORD//<NAME>)', () => {
    const tokens = [lit('ORD//'), ph('NAME', 'AI', true)];
    const hit = alignTokensToExample(tokens, 'AI', 'ORD//JOHN DOE');
    expect(hit!.get(1)).toBe('JOHN DOE');
  });
  it('refuses ambiguous keys with adjacent placeholders', () => {
    const tokens = [lit('FAVOR'), list('BANKS'), ph('AR')];
    expect(alignTokensToExample(tokens, 'AI', 'FAVOR RIYAD BANK note')).toBeNull();
  });
  it('returns null when the example does not fit the key or the field is absent', () => {
    expect(alignTokensToExample([lit('FAVOR')], 'AI', 'SOMETHING ELSE')).toBeNull();
    expect(alignTokensToExample([lit('FAVOR', 'D2')], 'AI', 'FAVOR X')).toBeNull();
  });
});

describe('humanizeKeyTokens', () => {
  it('builds a Starts-with label when the key opens with a literal', () => {
    expect(humanizeKeyTokens([lit('FAVOR'), list('BANKS')])).toBe('Starts with "FAVOR a bank"');
  });
  it('builds a Transactions-like label when the key opens with a placeholder', () => {
    expect(humanizeKeyTokens([ph('AR'), lit('SADAD')])).toBe('Transactions like "Arabic text SADAD"');
  });
  it('keeps glued chips flush (ORD// + <NAME>)', () => {
    expect(humanizeKeyTokens([lit('ORD//'), ph('NAME', 'AI', true)])).toBe('Starts with "ORD//a name"');
  });
  it('prefixes field segments only when the key spans both fields', () => {
    const label = humanizeKeyTokens([lit('ORD//'), ph('NAME', 'AI', true), lit('AC Transfer', 'D2')]);
    expect(label).toBe('Starts with "AI: ORD//a name · D2: AC Transfer"');
  });
  it('returns null for an empty key so the caller can fall back to the anchor', () => {
    expect(humanizeKeyTokens([])).toBeNull();
    expect(humanizeKeyTokens(null)).toBeNull();
  });
});

describe('editing operations', () => {
  it('replaceTokenAt keeps Field and Glued', () => {
    const out = replaceTokenAt([lit('ORD//'), ph('NAME', 'AI', true)], 1, { Kind: 'Placeholder', Text: 'STRING' });
    expect(out[1]).toMatchObject({ Field: 'AI', Kind: 'Placeholder', Text: 'STRING', Glued: true });
  });
  it('removeTokenAt un-glues the follower', () => {
    const out = removeTokenAt([lit('ORD//'), ph('NAME', 'AI', true)], 0);
    expect(out).toHaveLength(1);
    expect(out[0].Glued).toBe(false);
  });
  it('splitLiteralToken carves a placeholder out of a literal', () => {
    const tokens = [lit('FAVOR BANK OF AMERICA N A', 'D2')];
    const out = splitLiteralToken(tokens, 0, 6, 25, { Kind: 'Placeholder', Text: 'STRING' });
    expect(out).not.toBeNull();
    expect(out!.map((t) => [t.Kind, t.Text])).toEqual([
      ['Literal', 'FAVOR'],
      ['Placeholder', 'STRING'],
    ]);
    expect(out![0].Field).toBe('D2');
  });
  it('splitLiteralToken keeps trailing words as a new literal', () => {
    const out = splitLiteralToken([lit('TRF FROM SAUDI ARABIA TO X')], 0, 9, 21, { Kind: 'List', Text: 'COUNTRIES' });
    expect(out!.map((t) => t.Text)).toEqual(['TRF FROM', 'COUNTRIES', 'TO X']);
  });
  it('splitLiteralToken rejects non-literals and bad ranges', () => {
    expect(splitLiteralToken([ph('AR')], 0, 0, 1, { Kind: 'Placeholder', Text: 'STRING' })).toBeNull();
    expect(splitLiteralToken([lit('ABC')], 0, 2, 2, { Kind: 'Placeholder', Text: 'STRING' })).toBeNull();
  });
});

describe('locateSelectionInTokens', () => {
  it('finds selected words inside a literal chip, case-insensitively', () => {
    const tokens = [lit('FAVOR', 'D2'), lit('FAVOR BANK OF AMERICA N A', 'D2')];
    const hit = locateSelectionInTokens(tokens, 'bank of america n a');
    expect(hit).toEqual({ index: 1, start: 6, end: 25 });
  });
  it('tolerates extra spaces in the selection', () => {
    const hit = locateSelectionInTokens([lit('POS  PURCHASE REF')], 'POS PURCHASE');
    expect(hit).toEqual({ index: 0, start: 0, end: 13 });
  });
  it('returns null when the words are not in any literal', () => {
    expect(locateSelectionInTokens([lit('FAVOR'), ph('STRING')], 'EMIRATES NBD')).toBeNull();
    expect(locateSelectionInTokens([lit('FAVOR')], '   ')).toBeNull();
  });
});

describe('tokensPinSomething', () => {
  it('accepts a list value or a 3+-character literal', () => {
    expect(tokensPinSomething([list('BANKS')])).toBe(true);
    expect(tokensPinSomething([lit('FAVOR'), ph('STRING')])).toBe(true);
  });
  it('rejects keys made only of placeholders or tiny literals', () => {
    expect(tokensPinSomething([ph('STRING'), ph('INT')])).toBe(false);
    expect(tokensPinSomething([lit('A/'), ph('STRING')])).toBe(false);
  });
});

describe('tokensEqual', () => {
  it('detects a real change and ignores null-vs-absent Item/Glued', () => {
    const a: KeyToken[] = [{ Field: 'AI', Kind: 'Literal', Text: 'X' }];
    const b: KeyToken[] = [{ Field: 'AI', Kind: 'Literal', Text: 'X', Item: null, Glued: false }];
    expect(tokensEqual(a, b)).toBe(true);
    expect(tokensEqual(a, [lit('Y')])).toBe(false);
  });
});
