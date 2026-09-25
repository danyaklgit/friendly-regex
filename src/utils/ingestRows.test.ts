import { describe, it, expect } from 'vitest';
import { ingestRows } from './ingestRows';
import type { TransactionRow } from '../types';

const row = (fields: Record<string, unknown>): TransactionRow => fields as TransactionRow;

describe('ingestRows', () => {
  it('mirrors string OpsIsDeadEnd onto boolean IsDeadEnd', () => {
    const out = ingestRows([row({ Id: 'a', OpsIsDeadEnd: 'True' }), row({ Id: 'b', OpsIsDeadEnd: 'false' })]);
    expect(out[0]['IsDeadEnd']).toBe(true);
    expect(out[1]['IsDeadEnd']).toBe(false);
  });

  it('keeps rows untouched (same reference) when IsDeadEnd is already set', () => {
    const r = row({ Id: 'a', IsDeadEnd: true });
    expect(ingestRows([r])[0]).toBe(r);
  });

  it('keeps rows untouched when neither dead-end field is present', () => {
    const r = row({ Id: 'a' });
    expect(ingestRows([r])[0]).toBe(r);
  });

  it('drops rows whose Id already appeared earlier in the list', () => {
    const out = ingestRows([
      row({ Id: 'a', Sequence: 1 }),
      row({ Id: 'b', Sequence: 2 }),
      row({ Id: 'a', Sequence: 99 }), // blocking-sort duplicate
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r['Id'])).toEqual(['a', 'b']);
    expect(out[0]['Sequence']).toBe(1); // first occurrence wins
  });

  it('keeps every row that has no Id (empty key must not collapse distinct rows)', () => {
    const out = ingestRows([row({ Sequence: 1 }), row({ Sequence: 2 }), row({ Id: null, Sequence: 3 })]);
    expect(out).toHaveLength(3);
  });

  it('mirrors boolean OpsIsDeadEnd', () => {
    const out = ingestRows([row({ Id: 'a', OpsIsDeadEnd: true })]);
    expect(out[0]['IsDeadEnd']).toBe(true);
  });
});
