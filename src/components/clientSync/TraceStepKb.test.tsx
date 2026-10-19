import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceStepKb } from './TraceStepKb';
import { makeTraceFixture, makeKbCallFixture, makeKbStateFixture } from '../../utils/clientSync/fixtures';

describe('TraceStepKb', () => {
  it('shows kb_customer_type on the customer card when set, and nothing when it is null', () => {
    const data = makeTraceFixture().Kb;
    const { rerender } = render(<TraceStepKb data={{ ...data, Published: makeKbStateFixture({ KbCustomerType: 'CC' }) }} withDate={false} onOpenFile={() => {}} />);
    expect(within(screen.getByLabelText('Customer')).getByTitle('Knowledge-base customer type (kb_customer_type)').textContent).toBe('CC');
    rerender(<TraceStepKb data={data} withDate={false} onOpenFile={() => {}} />);
    expect(within(screen.getByLabelText('Customer')).queryByTitle('Knowledge-base customer type (kb_customer_type)')).toBeNull();
  });

  it('shows status, certainty, the customer card, collapsible published attributes and per-call Request | Response tabs with Whole call', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const data = makeTraceFixture().Kb;
    render(<TraceStepKb data={data} withDate={false} onOpenFile={onOpenFile} />);
    const step = screen.getByRole('region', { name: '3. Knowledge base' });
    expect(within(step).getByText('Promoted')).not.toBeNull();
    expect(within(step).getByText('Confirmed')).not.toBeNull();
    const card = within(step).getByLabelText('Customer');
    expect(within(card).getByText('Al Faris Co')).not.toBeNull();
    expect(within(card).getByText('شركة الفارس').getAttribute('dir')).toBe('rtl');
    expect(within(card).getByText('Gold')).not.toBeNull();
    expect(within(card).getByText('C-100')).not.toBeNull();
    expect(within(card).getByText('Corporate')).not.toBeNull();
    expect(within(card).getByText('1 alternative')).not.toBeNull();
    expect(within(step).getByText('Published attributes (1)')).not.toBeNull();
    expect(within(step).getByText('kb_customer_code')).not.toBeNull();
    expect(within(step).getByText(/"payer": "AL FARIS CO"/)).not.toBeNull();
    await user.click(within(step).getByRole('radio', { name: 'Response' }));
    expect(within(step).getByText(/"code": "C-100"/)).not.toBeNull();
    await user.click(within(step).getByRole('button', { name: 'Whole call' }));
    expect(onOpenFile).toHaveBeenCalledWith(data.Calls[0], 'request');
  });

  it('reads "did not know" for a null response, notes an operator layer that differs, and the pre-release note when calls are missing', async () => {
    const user = userEvent.setup();
    const data = makeTraceFixture().Kb;
    const { rerender } = render(<TraceStepKb data={{ ...data, Calls: [makeKbCallFixture({ ResponseRecordJson: null })], Operator: makeKbStateFixture({ Status: 'Pending' }) }} withDate={false} onOpenFile={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Response' }));
    expect(screen.getByText('The knowledge base did not know this payer')).not.toBeNull();
    expect(screen.getByText('Operator layer: Pending')).not.toBeNull();
    rerender(<TraceStepKb data={{ ...data, Calls: [] }} withDate={false} onOpenFile={() => {}} />);
    expect(screen.getByText('Call details not recorded for answers before 15 Oct 2026.')).not.toBeNull();
  });

  it('a null response reads "did not know" only for a call that succeeded, and "failed" for one that did not', async () => {
    const user = userEvent.setup();
    const data = makeTraceFixture().Kb;
    const { rerender } = render(<TraceStepKb data={{ ...data, Calls: [makeKbCallFixture({ ResponseRecordJson: null, Succeeded: true })] }} withDate={false} onOpenFile={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Response' }));
    expect(screen.getByText('The knowledge base did not know this payer')).not.toBeNull();
    expect(screen.queryByText('No response recorded: the call failed.')).toBeNull();
    rerender(<TraceStepKb data={{ ...data, Calls: [makeKbCallFixture({ ResponseRecordJson: null, Succeeded: false })] }} withDate={false} onOpenFile={() => {}} />);
    expect(screen.getByText('No response recorded: the call failed.')).not.toBeNull();
    expect(screen.queryByText('The knowledge base did not know this payer')).toBeNull();
  });

  it('shows only the muted line when the row is not eligible', () => {
    const data = makeTraceFixture().Kb;
    render(<TraceStepKb data={{ ...data, Published: makeKbStateFixture({ Status: 'NotEligible', Certainty: '', CertaintyRank: 0 }) }} withDate={false} onOpenFile={() => {}} />);
    expect(screen.getByText('Not eligible for the knowledge base: only tagged credits with a payer are looked up.')).not.toBeNull();
    expect(screen.getByText('Not eligible')).not.toBeNull();
    expect(screen.queryByLabelText('Customer')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
  });
});
