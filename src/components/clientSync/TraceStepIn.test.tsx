import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceStepIn } from './TraceStepIn';
import { makeTraceFixture, makeCallFixture } from '../../utils/clientSync/fixtures';

describe('TraceStepIn', () => {
  it('lists deliveries oldest first, marks the first accepted one, shows the item text, meta lines and viewer buttons', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const rejected = makeCallFixture({ LogId: 'rej', CallStartUtc: '2026-10-15T06:50:00Z', Succeeded: false, StatusCode: '400' });
    const accepted = makeCallFixture({ LogId: 'acc', CallStartUtc: '2026-10-15T06:55:00Z' });
    const data = makeTraceFixture({ In: { ...makeTraceFixture().In, Deliveries: [accepted, rejected] } }).In;
    render(<TraceStepIn data={data} withDate={false} onOpenFile={onOpenFile} />);
    const step = screen.getByRole('region', { name: '1. Received from BwaTech' });
    const groups = within(step).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Call rej', 'Call acc']);
    expect(within(groups[0]).queryByText('the delivery')).toBeNull();
    expect(within(groups[1]).getByText('the delivery')).not.toBeNull();
    expect(within(step).getByText(/"ref": "FT26288H51MC"/)).not.toBeNull();
    expect(within(step).getByText('anb_20261015_0655.json')).not.toBeNull();
    expect(within(step).getByText('40 transactions')).not.toBeNull();
    expect(within(step).queryByText(/Arrived after the confirmed statement/)).toBeNull();
    await user.click(within(groups[1]).getByRole('button', { name: 'Response' }));
    expect(onOpenFile).toHaveBeenCalledWith(accepted, 'response');
  });

  it('shows the late-arrival note, hides missing file buttons, and copes with no deliveries and no item text', () => {
    const base = makeTraceFixture().In;
    const { rerender } = render(<TraceStepIn data={{ ...base, LateArrival: true, Deliveries: [makeCallFixture({ HasRequestFile: false, HasResponseFile: false })] }} withDate={false} onOpenFile={() => {}} />);
    expect(screen.getByText('Arrived after the confirmed statement: stored archived and not sent to BwaTech (by design).')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Full request' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Response' })).toBeNull();
    rerender(<TraceStepIn data={{ ...base, Deliveries: [], ItemText: null, RawFileName: null, RawCreatedUtc: null, RawProcessedUtc: null, RawStoredTransactionCount: null }} withDate={false} onOpenFile={() => {}} />);
    expect(screen.getByText('No delivery recorded for this transaction.')).not.toBeNull();
    expect(screen.getByText('Item text not available.')).not.toBeNull();
  });
});
