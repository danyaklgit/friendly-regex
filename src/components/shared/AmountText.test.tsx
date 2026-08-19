import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AmountText, LEDGER_AMOUNT_FIELDS } from './AmountText';

describe('AmountText', () => {
  it('formats with thousands separators and a fixed 2-decimal fraction', () => {
    expect(render(<AmountText value={56426.57} />).container.textContent).toBe('56,426.57');
    expect(render(<AmountText value={172.5} />).container.textContent).toBe('172.50');
    expect(render(<AmountText value={0} />).container.textContent).toBe('0.00');
    expect(render(<AmountText value={1000000} />).container.textContent).toBe('1,000,000.00');
  });

  it('accepts numeric strings (the row payload shape)', () => {
    expect(render(<AmountText value="31482.53" />).container.textContent).toBe('31,482.53');
  });

  it('renders negatives with a leading minus (FXGainLoss can be negative)', () => {
    const text = render(<AmountText value={-3645.5} />).container.textContent!;
    expect(text).toContain('3,645.50');
    expect(text.startsWith('−')).toBe(true);
  });

  it('passes non-numeric or blank values through verbatim', () => {
    expect(render(<AmountText value="n/a" />).container.textContent).toBe('n/a');
    expect(render(<AmountText value="" />).container.textContent).toBe('');
  });

  it('covers the Ledger amount fields and only those', () => {
    expect([...LEDGER_AMOUNT_FIELDS].sort()).toEqual([
      'AmountFcy', 'FXGainLoss', 'TxnAmountFC', 'TxnAmountLC', 'VATAmount', 'VATBaseAmount',
    ]);
  });
});
