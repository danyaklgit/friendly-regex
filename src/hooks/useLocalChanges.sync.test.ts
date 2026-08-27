import { describe, it, expect, beforeEach } from 'vitest';
import { syncInProgressDrafts } from './useLocalChanges';
import type { TagSpecLibrary } from '../types';

function lib(overrides: Partial<TagSpecLibrary> & { defs?: string[] }): TagSpecLibrary {
  const { defs = ['A'], ...rest } = overrides;
  return {
    Id: 'lib-1',
    StatusTag: 'INPROGRESS',
    OperatorId: 'op',
    DataSetType: 'MT940',
    Context: [
      { Key: 'BankSwiftCode', Value: 'RJHISARI' },
      { Key: 'Side', Value: 'CR' },
    ],
    TagSpecDefinitions: defs.map((tag) => ({ Id: `def-${tag}`, Tag: tag })),
    ...rest,
  } as unknown as TagSpecLibrary;
}

beforeEach(() => localStorage.clear());

describe('syncInProgressDrafts', () => {
  it('writes the current draft and seeds the baseline for an INPROGRESS library', () => {
    const wrote = syncInProgressDrafts([lib({})]);
    expect(wrote).toBe(true);
    expect(localStorage.getItem('tep:baseline:MT940:RJHISARI:CR')).not.toBeNull();
    expect(localStorage.getItem('tep:current:MT940:RJHISARI:CR')).toBe(localStorage.getItem('tep:baseline:MT940:RJHISARI:CR'));
  });

  it('a Backlog delete (dispatch-only) shows up as a draft that differs from the baseline', () => {
    syncInProgressDrafts([lib({ defs: ['A', 'B'] })]);
    const wrote = syncInProgressDrafts([lib({ defs: ['A'] })]); // B deleted in state only
    expect(wrote).toBe(true);
    const baseline = localStorage.getItem('tep:baseline:MT940:RJHISARI:CR')!;
    const current = localStorage.getItem('tep:current:MT940:RJHISARI:CR')!;
    expect(baseline).not.toBe(current);
    expect(JSON.parse(current).TagSpecDefinitions).toHaveLength(1);
    // Baseline is never overwritten once seeded.
    expect(JSON.parse(baseline).TagSpecDefinitions).toHaveLength(2);
  });

  it('is a no-op (returns false) when the draft is already current', () => {
    syncInProgressDrafts([lib({})]);
    expect(syncInProgressDrafts([lib({})])).toBe(false);
  });

  it('skips non-INPROGRESS libraries and libraries without a complete identity', () => {
    const released = lib({ StatusTag: 'RELEASED' as never });
    const noSide = lib({ Context: [{ Key: 'BankSwiftCode', Value: 'RJHISARI' }] as never });
    expect(syncInProgressDrafts([released, noSide])).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('keys Ledger drafts by ClientCode/ErpCode', () => {
    const ledger = lib({
      DataSetType: 'Ledger',
      Context: [{ Key: 'ClientCode', Value: 'BWATECH' }, { Key: 'ErpCode', Value: 'ZOHO' }] as never,
    });
    syncInProgressDrafts([ledger]);
    expect(localStorage.getItem('tep:current:Ledger:BWATECH:ZOHO')).not.toBeNull();
  });
});
