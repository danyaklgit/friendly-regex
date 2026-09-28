import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsTab } from './ReportsTab';
import { REPORT_CONTROLS_STORAGE_KEY, DEFAULT_REPORT_CONTROLS } from '../../utils/reports/controls';
import { makeReportFixture, makeActivityFixture } from '../../utils/reports/fixtures';
import { formatAsOf } from '../../utils/reports/format';
import type { TepHeaders } from '../../api/transactions';

// vi.mock factories are hoisted above the imports, so the spies they hand out
// must come from vi.hoisted; their return values are set per test below.
const hooks = vi.hoisted(() => ({ useTaggingProgress: vi.fn(), useTaggingActivity: vi.fn() }));

vi.mock('../../hooks/useTaggingProgress', () => ({ useTaggingProgress: hooks.useTaggingProgress }));
vi.mock('../../hooks/useTaggingActivity', () => ({ useTaggingActivity: hooks.useTaggingActivity }));
vi.mock('../../hooks/useTagSpecs', () => ({
  useTagSpecs: () => ({
    libraries: [
      { Context: [{ Key: 'BankSwiftCode', Value: 'SABBSARI' }, { Key: 'Side', Value: 'CR' }] },
      { Context: [{ Key: 'BankSwiftCode', Value: 'SABBSARI' }, { Key: 'Side', Value: 'DR' }] },
      { Context: [{ Key: 'BankSwiftCode', Value: 'RJHISARI' }] },
    ],
  }),
}));
vi.mock('../../context/LovAttributesContext', () => ({
  useLovAttributes: () => ({ lovLookup: new Map([['BANKS', new Map([['SABBSARI', 'SABB']])]]) }),
}));
vi.mock('./CoverageView', () => ({
  CoverageView: ({ onCopy }: { onCopy: (t: string) => void }) => <div data-testid="coverage-view"><button type="button" onClick={() => onCopy('copied text')}>copy-from-view</button></div>,
}));
vi.mock('./ActivityView', () => ({
  ActivityView: ({ requested }: { requested: { from?: string; to?: string } }) => <div data-testid="activity-view" data-from={requested.from ?? ''} />,
}));

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };
const progressState = { report: makeReportFixture(), loading: false, error: null as string | null, refetch: vi.fn() };
const activityState = { report: makeActivityFixture(), loading: false, error: null as string | null, refetch: vi.fn() };

describe('ReportsTab', () => {
  beforeEach(() => {
    sessionStorage.clear();
    hooks.useTaggingProgress.mockReset().mockReturnValue(progressState);
    hooks.useTaggingActivity.mockReset().mockReturnValue(activityState);
    progressState.refetch.mockClear();
    activityState.refetch.mockClear();
  });

  it('starts on Coverage with default controls, enabling only the coverage hook', () => {
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByTestId('coverage-view')).toBeDefined();
    expect(screen.queryByTestId('activity-view')).toBeNull();
    expect(hooks.useTaggingProgress).toHaveBeenLastCalledWith(DEFAULT_REPORT_CONTROLS, 'tok', HEADERS, true);
    expect(hooks.useTaggingActivity).toHaveBeenLastCalledWith(DEFAULT_REPORT_CONTROLS, 'tok', HEADERS, false);
  });

  it('switches views, hides coverage-only filters on activity, and persists controls', async () => {
    const user = userEvent.setup();
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('radio', { name: 'Team activity' }));
    expect(screen.getByTestId('activity-view')).toBeDefined();
    expect(screen.queryByTestId('coverage-view')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Feed:/ })).toBeNull();
    expect(hooks.useTaggingActivity).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'activity' }), 'tok', HEADERS, true);
    expect(hooks.useTaggingProgress).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'activity' }), 'tok', HEADERS, false);
    await user.click(screen.getByRole('radio', { name: 'Week' }));
    expect(JSON.parse(sessionStorage.getItem(REPORT_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ view: 'activity', granularity: 'Week' });
  });

  it('restores persisted controls on mount', () => {
    sessionStorage.setItem(REPORT_CONTROLS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_REPORT_CONTROLS, preset: 'last30', view: 'activity' }));
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByTestId('activity-view').getAttribute('data-from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((screen.getByRole('combobox', { name: 'Date range' }) as HTMLSelectElement).value).toBe('last30');
  });

  it('builds bank options from the libraries, de-duplicated and labelled from the BANKS LOV', async () => {
    const user = userEvent.setup();
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: 'Bank: All' }));
    const labels = screen.getAllByRole('checkbox').map((c) => c.parentElement?.textContent);
    expect(labels).toEqual(['RJHISARI', 'SABB']);
    const titles = screen.getAllByRole('checkbox').map((c) => c.parentElement?.getAttribute('title'));
    expect(titles).toEqual(['RJHISARI', 'SABBSARI']);
  });

  it('routes the refresh button to the active view and copies to the clipboard with a toast', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: 'Refresh report' }));
    expect(progressState.refetch).toHaveBeenCalledOnce();
    expect(activityState.refetch).not.toHaveBeenCalled();
    await user.click(screen.getByText('copy-from-view'));
    expect(writeText).toHaveBeenCalledWith('copied text');
    expect(await screen.findByText('Summary copied')).toBeDefined();
  });

  it('routes the refresh button and as-of stamp to the activity view, and copies its summary', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('radio', { name: 'Team activity' }));

    await user.click(screen.getByRole('button', { name: 'Refresh report' }));
    expect(activityState.refetch).toHaveBeenCalledOnce();
    expect(progressState.refetch).not.toHaveBeenCalled();

    expect(screen.getByText(`as of ${formatAsOf(activityState.report.ComputedAtUtc)}`)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(writeText).toHaveBeenCalledWith(activityState.report.SummaryText);
  });

  it('disables Copy summary when the active (activity) report is missing or has no points', async () => {
    const user = userEvent.setup();
    hooks.useTaggingActivity.mockReturnValue({ ...activityState, report: null });
    const { rerender } = render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('radio', { name: 'Team activity' }));
    expect((screen.getByRole('button', { name: 'Copy summary' }) as HTMLButtonElement).disabled).toBe(true);

    hooks.useTaggingActivity.mockReturnValue({ ...activityState, report: { ...makeActivityFixture(), Points: [] } });
    rerender(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    expect((screen.getByRole('button', { name: 'Copy summary' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an error toast when the clipboard write is rejected', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByText('copy-from-view'));
    expect(await screen.findByText('Could not copy the summary')).toBeDefined();
  });

  it('shows an error toast when there is no clipboard object at all', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<ReportsTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByText('copy-from-view'));
    expect(await screen.findByText('Could not copy the summary')).toBeDefined();
  });
});
