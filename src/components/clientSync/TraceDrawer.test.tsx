import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IntegrationLog } from '../../api/transactions';
import { makeTraceFixture } from '../../utils/clientSync/fixtures';

vi.mock('../integrationLogs/IntegrationLogFileModal', () => ({
  IntegrationLogFileModal: ({ log, initialPane, onClose }: { log: IntegrationLog; initialPane?: string; onClose: () => void }) => (
    <div data-testid="file-modal" data-log={log.Id} data-pane={initialPane ?? 'request'}>
      <button type="button" onClick={onClose}>close modal</button>
    </div>
  ),
}));

import { TraceDrawer } from './TraceDrawer';

function renderDrawer(overrides: Partial<Parameters<typeof TraceDrawer>[0]> = {}) {
  const props = {
    transactionId: 'tx-1' as string | null,
    trace: makeTraceFixture() as ReturnType<typeof makeTraceFixture> | null,
    loading: false,
    error: null as string | null,
    onRetry: vi.fn(),
    onClose: vi.fn(),
    withDate: false,
    ...overrides,
  };
  render(<TraceDrawer {...props} />);
  return props;
}

describe('TraceDrawer', () => {
  it('is hidden without a selection and opens with the header, the four steps and a refresh button', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TraceDrawer transactionId={null} trace={null} loading={false} error={null} onRetry={() => {}} onClose={() => {}} withDate={false} />);
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('aria-hidden')).toBe('true');
    unmount();

    const props = renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Transaction trace' });
    expect(dialog.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByText('CR 12,500.00 · AL FARIS CO')).not.toBeNull();
    expect(screen.getByText('tx-1 · FT26288H51MC')).not.toBeNull();
    expect(screen.getByRole('region', { name: '1. Received from BwaTech' })).not.toBeNull();
    expect(screen.getByRole('region', { name: '2. Tagged by TEP' })).not.toBeNull();
    expect(screen.getByRole('region', { name: '3. Knowledge base' })).not.toBeNull();
    expect(screen.getByRole('region', { name: '4. Sent to BwaTech' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refresh trace' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('is inert while closed, so nothing inside the off-screen drawer can take focus', () => {
    const { rerender } = render(<TraceDrawer transactionId={null} trace={null} loading={false} error={null} onRetry={() => {}} onClose={() => {}} withDate={false} />);
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);
    rerender(<TraceDrawer transactionId="tx-1" trace={makeTraceFixture()} loading={false} error={null} onRetry={() => {}} onClose={() => {}} withDate={false} />);
    expect(screen.getByRole('dialog', { name: 'Transaction trace' }).hasAttribute('inert')).toBe(false);
  });

  it('closes on Escape, on the overlay and on the close button', async () => {
    const user = userEvent.setup();
    const props = renderDrawer();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('trace-overlay'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('shows a skeleton before the trace, the error card with Retry, and dims stale content while loading', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TraceDrawer transactionId="tx-1" trace={null} loading error={null} onRetry={() => {}} onClose={() => {}} withDate={false} />);
    expect(screen.getByRole('status', { name: 'Loading trace' })).not.toBeNull();
    unmount();
    const onRetry = vi.fn();
    render(<TraceDrawer transactionId="tx-1" trace={makeTraceFixture()} loading error="Trace unavailable" onRetry={onRetry} onClose={() => {}} withDate={false} />);
    expect(screen.getByRole('alert').textContent).toContain('Trace unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('trace-frame').className).toContain('opacity-60');
  });

  it('opens the log-file viewer from Full request on the request pane and from Response on the response pane', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const step1 = screen.getByRole('region', { name: '1. Received from BwaTech' });
    await user.click(within(step1).getByRole('button', { name: 'Full request' }));
    expect(screen.getByTestId('file-modal').getAttribute('data-log')).toBe('log-1');
    expect(screen.getByTestId('file-modal').getAttribute('data-pane')).toBe('request');
    await user.click(screen.getByRole('button', { name: 'close modal' }));
    expect(screen.queryByTestId('file-modal')).toBeNull();
    const responseButtons = screen.getAllByRole('button', { name: 'Response' });
    await user.click(responseButtons[0]);
    expect(screen.getByTestId('file-modal').getAttribute('data-pane')).toBe('response');
  });

  it('Escape closes the log-file viewer first, then the drawer', async () => {
    const user = userEvent.setup();
    const props = renderDrawer();
    const step1 = screen.getByRole('region', { name: '1. Received from BwaTech' });
    await user.click(within(step1).getByRole('button', { name: 'Full request' }));
    expect(screen.getByTestId('file-modal')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('file-modal')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('drops an open log-file viewer when the selection is cleared', async () => {
    const user = userEvent.setup();
    const props = {
      transactionId: 'tx-1' as string | null,
      trace: makeTraceFixture() as ReturnType<typeof makeTraceFixture> | null,
      loading: false,
      error: null as string | null,
      onRetry: () => {},
      onClose: () => {},
      withDate: false,
    };
    const { rerender } = render(<TraceDrawer {...props} />);
    const step1 = screen.getByRole('region', { name: '1. Received from BwaTech' });
    await user.click(within(step1).getByRole('button', { name: 'Full request' }));
    expect(screen.getByTestId('file-modal')).not.toBeNull();
    rerender(<TraceDrawer {...props} transactionId={null} trace={null} />);
    expect(screen.queryByTestId('file-modal')).toBeNull();
  });
});
