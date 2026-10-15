import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceStepOut } from './TraceStepOut';
import { makeTraceFixture, makeOutCallFixture } from '../../utils/clientSync/fixtures';

describe('TraceStepOut', () => {
  it('lists calls oldest first with operation labels and counts, tabs This row | Response, and what BwaTech holds now', async () => {
    const user = userEvent.setup();
    const data = makeTraceFixture().Out;
    const patch = makeOutCallFixture({ LogId: 'log-4', Endpoint: 'PatchTransactions', Operation: 'Delete', CallStartUtc: '2026-10-15T07:10:00Z', RecordCount: 1, ElementJson: '{"action":2}', ResponseText: null, HasResponseFile: false });
    render(<TraceStepOut data={{ ...data, Calls: [patch, ...data.Calls] }} outStatus="UPDATED" withDate={false} onOpenFile={() => {}} />);
    const step = screen.getByRole('region', { name: '4. Sent to BwaTech' });
    expect(within(step).getByText('Sent + patched')).not.toBeNull();
    const groups = within(step).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Call log-3', 'Call log-4']);
    expect(within(groups[0]).getByText('insert')).not.toBeNull();
    expect(within(groups[0]).getByText('40 txns')).not.toBeNull();
    expect(within(groups[1]).getByText('delete')).not.toBeNull();
    expect(within(groups[0]).getByText(/"id": "tx-1"/)).not.toBeNull();
    await user.click(within(groups[0]).getByRole('radio', { name: 'Response' }));
    expect(within(groups[0]).getByText('OK')).not.toBeNull();
    await user.click(within(groups[1]).getByRole('radio', { name: 'Response' }));
    expect(within(groups[1]).getByText('Response not recorded.')).not.toBeNull();
    const holds = within(step).getByLabelText('What BwaTech holds now');
    expect(within(holds).getByText('IncomingTransfer')).not.toBeNull();
    expect(within(holds).getByText('kb_customer_code').className).toContain('text-primary');
    expect(within(holds).getByText('payer_name').className).not.toContain('text-primary');
    expect(within(holds).queryByText(/Deleted at BwaTech/)).toBeNull();
  });

  it('falls back to viewer buttons when texts are null and files exist, and shows the deleted note', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const call = makeOutCallFixture({ ElementJson: null, ResponseText: null });
    render(<TraceStepOut data={{ Calls: [call], CurrentTag: null, CurrentAttributes: [], DeletedAtBwatech: true }} outStatus="DELETED" withDate={false} onOpenFile={onOpenFile} />);
    await user.click(screen.getByRole('button', { name: 'Open the full request' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'request');
    await user.click(screen.getByRole('radio', { name: 'Response' }));
    await user.click(screen.getByRole('button', { name: 'Open the full response' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'response');
    expect(screen.getByText('Deleted at BwaTech (patch action 2)')).not.toBeNull();
    expect(screen.getByText('No tag held.')).not.toBeNull();
    expect(screen.getByText('No attributes held')).not.toBeNull();
  });
});
