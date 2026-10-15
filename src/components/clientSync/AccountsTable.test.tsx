import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AccountsTable } from './AccountsTable';
import { makeAccountFixture } from '../../utils/clientSync/fixtures';

describe('AccountsTable', () => {
  it('renders one row per account with the documented columns, state badge, KB off chip and dashes', () => {
    render(<AccountsTable withDate={false} accounts={[
      makeAccountFixture(),
      makeAccountFixture({ IBAN: 'SA4420000001234567891234', AccountName: '', DataSetTypes: [], Deliveries: 0, LastDeliveryUtc: null, Transactions: 0, Untagged: 0, KbEnabled: false, KbPending: 0, OutFailures: 0, MedianReceiptToPushMs: null, State: 'IDLE' }),
    ]} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Account', 'Bank', 'Feeds', 'Last delivery', 'Transactions', 'Untagged', 'KB pending', 'Out failures', 'In to out median', 'State']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText('SA03 8000 0000 6080 1016 7519')).not.toBeNull();
    expect(first.getByText('Main SAR')).not.toBeNull();
    expect(first.getByText('INTERIM TL, MT940')).not.toBeNull();
    expect(first.getByText(/^\d{2}:\d{2}:\d{2}$/)).not.toBeNull();
    expect(first.getByText('150')).not.toBeNull();
    expect(first.getByText('10').className).toContain('text-red-600');
    expect(first.getByText('1.7 s')).not.toBeNull();
    expect(first.getByText('Attention')).not.toBeNull();
    expect(first.queryByText('KB off')).toBeNull();
    const second = within(rows[1]);
    expect(second.getByText('no delivery')).not.toBeNull();
    expect(second.getByText('No delivery')).not.toBeNull();
    expect(second.getByText('KB off')).not.toBeNull();
    expect(second.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a placeholder row when there are no accounts', () => {
    render(<AccountsTable accounts={[]} withDate={false} />);
    expect(screen.getByText('No accounts in this scope.')).not.toBeNull();
  });

  it('is memoized so a parent re-render with the same props skips it', () => {
    expect((AccountsTable as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
