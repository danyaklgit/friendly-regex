import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportFilters } from './ReportFilters';
import { DEFAULT_REPORT_CONTROLS, type ReportControls } from '../../utils/reports/controls';

function renderFilters(patch: Partial<ReportControls> = {}, props: Partial<Parameters<typeof ReportFilters>[0]> = {}) {
  const onChange = vi.fn();
  const onRefresh = vi.fn();
  const onCopySummary = vi.fn();
  render(
    <ReportFilters
      controls={{ ...DEFAULT_REPORT_CONTROLS, ...patch }}
      onChange={onChange}
      showCoverageFilters
      bankOptions={[{ value: 'SABBSARI', label: 'SABB', title: 'SABBSARI' }]}
      computedAtUtc="2026-09-28T08:45:00Z"
      loading={false}
      onRefresh={onRefresh}
      onCopySummary={onCopySummary}
      copyDisabled={false}
      {...props}
    />,
  );
  return { onChange, onRefresh, onCopySummary };
}

describe('ReportFilters', () => {
  it('changes the preset, granularity, and layer through onChange patches', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'last30');
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'last30' });
    await user.click(screen.getByRole('radio', { name: 'Week' }));
    expect(onChange).toHaveBeenLastCalledWith({ granularity: 'Week' });
    await user.click(screen.getByRole('radio', { name: 'Published' }));
    expect(onChange).toHaveBeenLastCalledWith({ layer: 'Active' });
  });

  it('shows no date fields for a preset range', () => {
    renderFilters({ preset: 'last90' });
    expect(screen.queryAllByPlaceholderText('yyyy-mm-dd')).toHaveLength(0);
  });

  it('shows From and To for the custom preset and rejects an inverted range', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' });
    const [from, to] = screen.getAllByPlaceholderText('yyyy-mm-dd') as HTMLInputElement[];
    expect(from.value).toBe('2026-03-01');
    expect(to.value).toBe('2026-03-31');
    expect(screen.getByText('From')).toBeDefined();
    expect(screen.getByText('To')).toBeDefined();
    await user.clear(from);
    expect(onChange).toHaveBeenLastCalledWith({ from: '' });
    await user.type(from, '2026-04-15'); // after To: rejected, nothing new emitted
    expect(onChange).toHaveBeenLastCalledWith({ from: '' });
    await user.clear(from);
    await user.type(from, '2026-02-15');
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-02-15' });
    await user.clear(to);
    expect(onChange).toHaveBeenLastCalledWith({ to: '' });
    await user.type(to, '2026-02-01'); // before From: rejected
    expect(onChange).toHaveBeenLastCalledWith({ to: '' });
    await user.clear(to);
    await user.type(to, '2026-04-30');
    expect(onChange).toHaveBeenLastCalledWith({ to: '2026-04-30' });
    await user.click(screen.getByRole('button', { name: 'Clear From' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '' });
  });

  it('shows the Published hint only on the Active layer', () => {
    renderFilters({ layer: 'Active' });
    expect(screen.getByText('Published data. The first load after switching may take longer.')).toBeDefined();
  });

  it('hides feed, bank, side, and layer for the activity view', () => {
    renderFilters({}, { showCoverageFilters: false });
    expect(screen.queryByRole('button', { name: /^Feed:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Bank:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Side:/ })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Layer' })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Granularity' })).toBeDefined();
  });

  it('shows the as-of stamp, refreshes, and copies', async () => {
    const user = userEvent.setup();
    const { onRefresh, onCopySummary } = renderFilters();
    expect(screen.getByText(/^as of \d{2}:\d{2}$/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Refresh report' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(onCopySummary).toHaveBeenCalledOnce();
  });

  it('spins the refresh icon and hides the stamp while loading without a report', () => {
    renderFilters({}, { loading: true, computedAtUtc: null });
    expect(screen.queryByText(/^as of/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh report' }).querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });
});
