import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallRow } from './CallRow';
import { makeCallFixture } from '../../utils/clientSync/fixtures';

describe('CallRow', () => {
  it('shows time, endpoint, label, record count, status badge and duration, with both file buttons', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const call = makeCallFixture();
    render(<CallRow call={call} label="the delivery" withDate={false} onOpenFile={onOpenFile}><p>body</p></CallRow>);
    const row = screen.getByRole('group', { name: 'Call log-1' });
    expect(row.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(screen.getByText('ProcessTransactionsForTagging')).not.toBeNull();
    expect(screen.getByText('the delivery')).not.toBeNull();
    expect(screen.getByText('40 txns')).not.toBeNull();
    expect(screen.getByText('0')).not.toBeNull();
    expect(screen.getByText('420 ms')).not.toBeNull();
    expect(screen.getByText('body')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Full request' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'request');
    await user.click(screen.getByRole('button', { name: 'Response' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'response');
  });

  it('hides the buttons whose file is missing, offers a single Whole call button, or none', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const { rerender } = render(<CallRow call={makeCallFixture({ HasRequestFile: false, HasResponseFile: true })} withDate={false} onOpenFile={onOpenFile} />);
    expect(screen.queryByRole('button', { name: 'Full request' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Response' })).not.toBeNull();

    const call = makeCallFixture({ HasRequestFile: true, HasResponseFile: false, RecordCount: null, DurationMs: null });
    rerender(<CallRow call={call} withDate={false} onOpenFile={onOpenFile} fileButtons="whole" />);
    expect(screen.queryByRole('button', { name: 'Response' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Whole call' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'request');
    expect(screen.queryByText(/txns/)).toBeNull();

    rerender(<CallRow call={makeCallFixture({ HasRequestFile: false, HasResponseFile: false })} withDate={false} onOpenFile={onOpenFile} fileButtons="whole" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<CallRow call={makeCallFixture()} withDate={false} onOpenFile={onOpenFile} fileButtons="none" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
