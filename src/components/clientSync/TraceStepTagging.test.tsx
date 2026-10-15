import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceStepTagging } from './TraceStepTagging';
import { makeTraceFixture, makeTagStateFixture } from '../../utils/clientSync/fixtures';

describe('TraceStepTagging', () => {
  it('shows the published tag, nickname, library line and attributes by default, with no layer control when the layers agree', () => {
    render(<TraceStepTagging data={makeTraceFixture().Tagging} />);
    expect(screen.getByRole('region', { name: '2. Tagged by TEP' })).not.toBeNull();
    expect(screen.getByText('IncomingTransfer')).not.toBeNull();
    expect(screen.getByText('Transfers in')).not.toBeNull();
    expect(screen.getByText('library v12 ACTIVE')).not.toBeNull();
    expect(screen.getByText('payer_name').querySelector('[aria-label="mandatory"]')).not.toBeNull();
    expect(screen.getByText('INV 2231').className).toContain('text-red-600');
    expect(screen.queryByRole('radiogroup', { name: 'Tag layer' })).toBeNull();
    expect(screen.queryByText('Operator tag not released yet')).toBeNull();
  });

  it('offers Published | Operator with the warning line when the layers differ, and switches the view', async () => {
    const user = userEvent.setup();
    const t = makeTraceFixture().Tagging;
    render(<TraceStepTagging data={{ ...t, LayersDiffer: true, Operator: makeTagStateFixture({ Tag: 'BillPayment', Nickname: null, LibraryStatus: 'INPROGRESS', LibraryVersion: 13, Attributes: [] }) }} />);
    expect(screen.getByText('Operator tag not released yet')).not.toBeNull();
    expect(screen.getByText('IncomingTransfer')).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Operator' }));
    expect(screen.getByText('BillPayment')).not.toBeNull();
    expect(screen.getByText('library v13 INPROGRESS')).not.toBeNull();
    expect(screen.getByText('No attributes extracted')).not.toBeNull();
    expect(screen.queryByText('IncomingTransfer')).toBeNull();
  });

  it('falls back to Published when the layers stop differing while Operator is chosen', async () => {
    const user = userEvent.setup();
    const t = makeTraceFixture().Tagging;
    const differing = { ...t, LayersDiffer: true, Operator: makeTagStateFixture({ Tag: 'BillPayment' }) };
    const { rerender } = render(<TraceStepTagging data={differing} />);
    await user.click(screen.getByRole('radio', { name: 'Operator' }));
    expect(screen.getByText('BillPayment')).not.toBeNull();
    rerender(<TraceStepTagging data={{ ...differing, LayersDiffer: false }} />);
    expect(screen.getByText('IncomingTransfer')).not.toBeNull();
    expect(screen.queryByText('BillPayment')).toBeNull();
  });

  it('shows the untagged branch with the dead-end marker and other tags on multi-tag rows', () => {
    const t = makeTraceFixture().Tagging;
    const { rerender } = render(<TraceStepTagging data={{ ...t, Published: makeTagStateFixture({ Tag: '', IsUntagged: true, IsDeadEnd: true, Attributes: [] }) }} />);
    expect(screen.getByText('Untagged')).not.toBeNull();
    expect(screen.getByText('No rule matched this transaction (marked dead end).')).not.toBeNull();
    rerender(<TraceStepTagging data={{ ...t, Published: makeTagStateFixture({ IsMultiTag: true, OtherTags: ['Fees', 'VAT'] }) }} />);
    expect(screen.getByText('Fees')).not.toBeNull();
    expect(screen.getByText('VAT')).not.toBeNull();
  });
});
