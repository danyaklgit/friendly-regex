import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportTagLibraries, exportSingleDefinition, importTagLibraries } from './persistence';
import type { TagSpecLibrary, TagSpecDefinition } from '../types';

const mockLib: TagSpecLibrary = {
  Id: 'lib-1',
  ActiveTagSpecLibId: null,
  OperatorId: 'op-1',
  StatusTag: 'ACTIVE',
  DataSetType: 'MT940',
  Version: 1,
  VersionDate: '2025-01-01',
  Context: [{ Key: 'Side', Value: 'DEBIT' }],
  TagSpecDefinitions: [],
};

const mockDef: TagSpecDefinition = {
  Id: 'def-1',
  Context: [],
  Tag: 'SALARY',
  StatusTag: 'ACTIVE',
  CertaintyLevelTag: 'HIGH',
  Validity: { StartDate: null, EndDate: null },
  TagRuleExpressions: [],
  Attributes: [],
};

describe('exportTagLibraries', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('creates and clicks a download link', () => {
    exportTagLibraries([mockLib]);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock');
  });

  it('uses default filename', () => {
    const el = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(el);
    exportTagLibraries([mockLib]);
    expect((el as any).download).toBe('tag-libraries.json');
  });

  it('uses custom filename', () => {
    const el = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(el);
    exportTagLibraries([mockLib], 'custom.json');
    expect((el as any).download).toBe('custom.json');
  });
});

describe('exportSingleDefinition', () => {
  it('wraps definition in a library and exports', () => {
    const el = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(el);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    exportSingleDefinition(mockDef, mockLib);
    expect((el as any).download).toBe('tag-SALARY-def-1.json');
    expect(el.click).toHaveBeenCalled();
  });
});

describe('importTagLibraries', () => {
  it('resolves with parsed libraries', async () => {
    const validData = [mockLib];
    const file = new File([JSON.stringify(validData)], 'test.json', { type: 'application/json' });
    const result = await importTagLibraries(file);
    expect(result).toEqual(validData);
  });

  it('rejects with invalid format', async () => {
    const file = new File(['{"not": "array"}'], 'test.json', { type: 'application/json' });
    await expect(importTagLibraries(file)).rejects.toThrow('Invalid file format');
  });

  it('rejects with invalid JSON', async () => {
    const file = new File(['not json at all'], 'test.json', { type: 'application/json' });
    await expect(importTagLibraries(file)).rejects.toThrow();
  });

  it('rejects when array items lack required fields', async () => {
    const file = new File([JSON.stringify([{ foo: 'bar' }])], 'test.json', { type: 'application/json' });
    await expect(importTagLibraries(file)).rejects.toThrow('Invalid file format');
  });

  it('rejects on reader error', async () => {
    const mockError = new DOMException('Read failed');
    const originalFileReader = globalThis.FileReader;
    globalThis.FileReader = class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error = mockError;
      readAsText() {
        setTimeout(() => this.onerror?.(), 0);
      }
    } as any;
    const file = new File(['data'], 'test.json');
    await expect(importTagLibraries(file)).rejects.toBe(mockError);
    globalThis.FileReader = originalFileReader;
  });
});
