import { describe, it, expect } from 'vitest';
import { FEED_SLOT, OTHER_FEED_COLOR, TAGGED_COLOR, UNTAGGED_COLOR, feedSlot, feedColor, feedLabel } from './feedSlots';

describe('feedSlots', () => {
  it('assigns fixed slots by identity, never by position', () => {
    expect(FEED_SLOT).toEqual({ MT940: 1, MT942: 2, INTERIM_MT940: 3, INTERIM_TransactionsList: 4, Ledger: 5 });
    expect(feedSlot('Ledger')).toBe(5);
    expect(feedSlot('SomethingNew')).toBeNull();
  });

  it('maps slots to chart tokens and unknown feeds to the de-emphasis gray', () => {
    expect(feedColor('MT940')).toBe('var(--color-chart-1)');
    expect(feedColor('Ledger')).toBe('var(--color-chart-5)');
    expect(feedColor('SomethingNew')).toBe(OTHER_FEED_COLOR);
    expect(OTHER_FEED_COLOR).toBe('var(--color-faint)');
    expect(TAGGED_COLOR).toBe('var(--color-chart-1)');
    expect(UNTAGGED_COLOR).toBe('var(--color-chart-2)');
  });

  it('labels known feeds and falls back to the raw code', () => {
    expect(feedLabel('INTERIM_MT940')).toBe('Interim MT940');
    expect(feedLabel('Ledger')).toBe('Ledger (ERP)');
    expect(feedLabel('SomethingNew')).toBe('SomethingNew');
  });
});
