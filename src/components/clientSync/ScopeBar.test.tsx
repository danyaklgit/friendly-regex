import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopeBar } from './ScopeBar';
import { DEFAULT_CLIENT_SYNC_CONTROLS, type ClientSyncControls } from '../../utils/clientSync/scope';
import type { VipClient } from '../../hooks/useVipClients';

const CLIENTS: VipClient[] = [
  { orgId: 'ORG-A', name: 'Acme Trading', accounts: [
    { iban: 'SA0380000000608010167519', bankCode: 'RJHISARI', accountName: 'Main SAR' },
    { iban: 'SA4420000001234567891234', bankCode: 'RJHISARI', accountName: 'Payroll' },
  ] },
  { orgId: 'ORG-B', name: 'Beta Foods', accounts: [] },
];

function renderBar(overrides: Partial<Parameters<typeof ScopeBar>[0]> = {}, controls: Partial<ClientSyncControls> = {}) {
  const props = {
    clients: CLIENTS,
    clientsLoading: false,
    clientsError: null as string | null,
    onRetryClients: vi.fn(),
    controls: { ...DEFAULT_CLIENT_SYNC_CONTROLS, ...controls },
    onChange: vi.fn(),
    rangeError: null as string | null,
    generatedAtUtc: null as string | null,
    loading: false,
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<ScopeBar {...props} />);
  return props;
}

describe('ScopeBar', () => {
  it('picks a client and resets the accounts; refresh is disabled without a client', async () => {
    const user = userEvent.setup();
    const props = renderBar();
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText('Select a client'));
    await user.click(screen.getByText('Beta Foods'));
    expect(props.onChange).toHaveBeenCalledWith({ orgId: 'ORG-B', ibans: [] });
  });

  it('shows the account chips of the picked client, toggles them and clears them with All accounts', async () => {
    const user = userEvent.setup();
    const props = renderBar({}, { orgId: 'ORG-A', ibans: ['SA4420000001234567891234'] });
    expect((screen.getByRole('button', { name: 'All accounts' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByText('SA03 8000 0000 6080 1016 7519 · RJHISARI · Main SAR'));
    expect(props.onChange).toHaveBeenLastCalledWith({ ibans: ['SA4420000001234567891234', 'SA0380000000608010167519'] });
    await user.click(screen.getByRole('button', { name: 'All accounts' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ ibans: [] });
  });

  it('switches day mode and layer, shows the date fields and the range error in range mode, and toggles auto-refresh', async () => {
    const user = userEvent.setup();
    const props = renderBar({ rangeError: 'Range can cover at most 31 days.' }, { orgId: 'ORG-A', mode: 'range', from: '2026-09-01', to: '2026-10-10' });
    expect(screen.getByText('From')).not.toBeNull();
    expect(screen.getByText('To')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Range can cover at most 31 days.');
    await user.click(screen.getByRole('radio', { name: 'Today' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ mode: 'today' });
    await user.click(screen.getByRole('radio', { name: 'Confirmed' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ layer: 'CONFIRMED' });
    await user.click(screen.getByRole('switch', { name: 'Auto-refresh 30 s' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ autoRefresh: false });
  });

  it('hides the date fields in today mode and refreshes', async () => {
    const user = userEvent.setup();
    const props = renderBar({}, { orgId: 'ORG-A' });
    expect(screen.queryByText('From')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  describe('live caption', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-15T08:00:18Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('owns its clock: advances every 5 s and on returning to the tab', () => {
      renderBar({ generatedAtUtc: '2026-10-15T08:00:00Z' }, { orgId: 'ORG-A' });
      expect(screen.getByText('Live, refreshed 18 s ago')).not.toBeNull();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByText('Live, refreshed 23 s ago')).not.toBeNull();
      act(() => {
        vi.setSystemTime(new Date('2026-10-15T08:00:40Z'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.getByText('Live, refreshed 40 s ago')).not.toBeNull();
    });

    it('hides without a generated time', () => {
      renderBar({ generatedAtUtc: null }, { orgId: 'ORG-A' });
      expect(screen.queryByText(/Live, refreshed/)).toBeNull();
    });
  });

  it('shows the error card in place of the picker when the VIP list fails', async () => {
    const user = userEvent.setup();
    const props = renderBar({ clientsError: 'VIP list unavailable', clients: [] });
    expect(screen.getByRole('alert').textContent).toContain('VIP list unavailable');
    expect(screen.queryByText('Select a client')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetryClients).toHaveBeenCalledTimes(1);
  });
});
