import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  serializeFilters,
  deserializeFilters,
  buildShareUrl,
  parseShareParams,
  storeShareParams,
  consumeStoredShareParams,
  clearShareParamsFromUrl,
} from './shareLink';
import type { ShareParams } from './shareLink';

describe('shareLink utilities', () => {
  // --- serializeFilters / deserializeFilters ---

  describe('serializeFilters', () => {
    it('serializes non-empty sets to base64 JSON', () => {
      const filters = { BANKS: new Set(['A', 'B']), SIDE: new Set(['CR']) };
      const encoded = serializeFilters(filters);
      const decoded = JSON.parse(atob(encoded));
      expect(decoded).toEqual({ BANKS: ['A', 'B'], SIDE: ['CR'] });
    });

    it('omits keys with empty sets', () => {
      const filters = { BANKS: new Set<string>(), SIDE: new Set(['CR']) };
      const encoded = serializeFilters(filters);
      const decoded = JSON.parse(atob(encoded));
      expect(decoded).toEqual({ SIDE: ['CR'] });
    });
  });

  describe('deserializeFilters', () => {
    it('deserializes base64 JSON back to Record<string, Set>', () => {
      const encoded = btoa(JSON.stringify({ BANKS: ['A', 'B'] }));
      const result = deserializeFilters(encoded);
      expect(result.BANKS).toEqual(new Set(['A', 'B']));
    });
  });

  describe('serializeFilters → deserializeFilters round-trip', () => {
    it('preserves data through encode/decode cycle', () => {
      const original = { foo: new Set(['x', 'y']), bar: new Set(['z']) };
      const result = deserializeFilters(serializeFilters(original));
      expect(result.foo).toEqual(new Set(['x', 'y']));
      expect(result.bar).toEqual(new Set(['z']));
    });
  });

  // --- buildShareUrl ---

  describe('buildShareUrl', () => {
    it('builds a URL with required params', () => {
      const url = buildShareUrl({
        bank: 'ARNB',
        side: 'CR',
        filters: { BANKS: new Set(['ARNB']) },
        sharedBy: 'Nadim',
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('share')).toBe('1');
      expect(parsed.searchParams.get('bank')).toBe('ARNB');
      expect(parsed.searchParams.get('side')).toBe('CR');
      expect(parsed.searchParams.get('shared_by')).toBe('Nadim');
      expect(parsed.searchParams.has('filters')).toBe(true);
    });

    it('includes toggles when provided', () => {
      const url = buildShareUrl({
        bank: 'X', side: 'DR', filters: {}, sharedBy: 'A',
        toggles: { compactMode: true, incrementalPagination: false, showAttributes: true },
      });
      const parsed = new URL(url);
      const toggles = JSON.parse(atob(parsed.searchParams.get('toggles')!));
      expect(toggles.compactMode).toBe(true);
      expect(toggles.showAttributes).toBe(true);
    });

    it('includes note when provided', () => {
      const url = buildShareUrl({
        bank: 'X', side: 'CR', filters: {}, sharedBy: 'A', note: 'hello',
      });
      expect(new URL(url).searchParams.get('note')).toBe('hello');
    });

    it('omits toggles and note when not provided', () => {
      const url = buildShareUrl({ bank: 'X', side: 'CR', filters: {}, sharedBy: 'A' });
      const parsed = new URL(url);
      expect(parsed.searchParams.has('toggles')).toBe(false);
      expect(parsed.searchParams.has('note')).toBe(false);
    });
  });

  // --- parseShareParams ---

  describe('parseShareParams', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    function setSearch(search: string) {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, search },
        writable: true,
      });
    }

    it('returns null when share param is absent', () => {
      setSearch('');
      expect(parseShareParams()).toBeNull();
    });

    it('returns null when required params are missing', () => {
      setSearch('?share=1&bank=X');
      expect(parseShareParams()).toBeNull();
    });

    it('parses a valid share link', () => {
      const filters = btoa(JSON.stringify({ BANKS: ['ARNB'] }));
      setSearch(`?share=1&bank=ARNB&side=CR&filters=${filters}&shared_by=Nadim`);
      const result = parseShareParams();
      expect(result).not.toBeNull();
      expect(result!.bank).toBe('ARNB');
      expect(result!.side).toBe('CR');
      expect(result!.sharedBy).toBe('Nadim');
      expect(result!.filters.BANKS).toEqual(new Set(['ARNB']));
    });

    it('parses toggles and note', () => {
      const filters = btoa(JSON.stringify({ X: ['Y'] }));
      const toggles = btoa(JSON.stringify({ compactMode: true, incrementalPagination: false, showAttributes: true }));
      setSearch(`?share=1&bank=A&side=B&filters=${filters}&shared_by=Z&toggles=${toggles}&note=hi`);
      const result = parseShareParams();
      expect(result!.toggles?.compactMode).toBe(true);
      expect(result!.note).toBe('hi');
    });

    it('returns null on invalid base64', () => {
      setSearch('?share=1&bank=A&side=B&filters=!!!invalid&shared_by=Z');
      expect(parseShareParams()).toBeNull();
    });
  });

  // --- storeShareParams / consumeStoredShareParams ---

  describe('storeShareParams / consumeStoredShareParams', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    it('stores and consumes share params via sessionStorage', () => {
      const params: ShareParams = {
        bank: 'ARNB', side: 'CR', filters: { X: new Set(['a']) },
        toggles: { compactMode: true, incrementalPagination: false, showAttributes: false },
        note: 'test', sharedBy: 'Nadim',
      };
      storeShareParams(params);
      const result = consumeStoredShareParams();
      expect(result).not.toBeNull();
      expect(result!.bank).toBe('ARNB');
      expect(result!.filters.X).toEqual(new Set(['a']));
      expect(result!.toggles?.compactMode).toBe(true);
      expect(result!.note).toBe('test');
    });

    it('returns null and clears storage after consumption', () => {
      storeShareParams({ bank: 'A', side: 'B', filters: {}, sharedBy: 'Z' });
      consumeStoredShareParams();
      expect(consumeStoredShareParams()).toBeNull();
    });

    it('returns null when nothing is stored', () => {
      expect(consumeStoredShareParams()).toBeNull();
    });

    it('returns null on corrupt data and clears storage', () => {
      sessionStorage.setItem('tep:shareParams', '!!!not-json');
      expect(consumeStoredShareParams()).toBeNull();
      expect(sessionStorage.getItem('tep:shareParams')).toBeNull();
    });
  });

  // --- clearShareParamsFromUrl ---

  describe('clearShareParamsFromUrl', () => {
    it('removes share-related params from the URL, keeping unrelated ones', () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          href: 'http://localhost/?share=1&bank=X&side=Y&filters=abc&toggles=def&note=hi&shared_by=Z&other=keep',
          search: '?share=1&bank=X&side=Y&filters=abc&toggles=def&note=hi&shared_by=Z&other=keep',
          pathname: '/',
          origin: 'http://localhost',
        },
        writable: true,
      });
      clearShareParamsFromUrl();
      expect(replaceSpy).toHaveBeenCalled();
      const newUrl = replaceSpy.mock.calls[0][2] as string;
      expect(newUrl).toContain('other=keep');
      expect(newUrl).not.toContain('share=');
      expect(newUrl).not.toContain('bank=');
      replaceSpy.mockRestore();
    });

    it('produces a clean pathname when no params remain after stripping', () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          href: 'http://localhost/?share=1&bank=X&side=Y&filters=abc&shared_by=Z',
          search: '?share=1&bank=X&side=Y&filters=abc&shared_by=Z',
          pathname: '/',
          origin: 'http://localhost',
        },
        writable: true,
      });
      clearShareParamsFromUrl();
      const newUrl = replaceSpy.mock.calls[0][2] as string;
      expect(newUrl).toBe('/');
      replaceSpy.mockRestore();
    });
  });
});
