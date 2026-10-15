import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StageCards } from './StageCards';
import { makeSummaryFixture } from '../../utils/clientSync/fixtures';

describe('StageCards', () => {
  it('renders the four cards from the summary with their numbers, chips, footers and health', () => {
    render(<StageCards summary={makeSummaryFixture()} withDate={false} />);
    const inCard = screen.getByRole('region', { name: 'In from BwaTech' });
    expect(within(inCard).getByText('212')).not.toBeNull();
    expect(within(inCard).getByText('14 deliveries')).not.toBeNull();
    expect(within(inCard).getByText('INTERIM TL 180')).not.toBeNull();
    expect(within(inCard).getByText(/^Last delivery \d{2}:\d{2}:\d{2}$/)).not.toBeNull();
    expect(within(inCard).getByText('OK')).not.toBeNull();

    const tagged = screen.getByRole('region', { name: 'Tagged by TEP' });
    expect(within(tagged).getByText('93%')).not.toBeNull();
    expect(within(tagged).getByText('197 of 212 tagged')).not.toBeNull();
    expect(within(tagged).getByText('15 untagged')).not.toBeNull();
    expect(within(tagged).getByText('2 not released yet')).not.toBeNull();
    expect(within(tagged).getByText('Published and operator tags agree on 210 rows')).not.toBeNull();
    expect(within(tagged).getByText('Untagged rows')).not.toBeNull();

    const kb = screen.getByRole('region', { name: 'Knowledge base' });
    expect(within(kb).getByText('61')).not.toBeNull();
    expect(within(kb).getByText('credits asked')).not.toBeNull();
    expect(within(kb).getByText('4 pending')).not.toBeNull();
    expect(within(kb).getByText('61 calls · median 412 ms')).not.toBeNull();
    expect(within(kb).getByText('Attention')).not.toBeNull();
    const bar = within(kb).getByLabelText('By certainty');
    expect(bar.textContent).toBe('Confirmed 30Likely 18');

    const out = screen.getByRole('region', { name: 'Out to BwaTech' });
    expect(within(out).getByText('17')).not.toBeNull();
    expect(within(out).getByText('13 pushes OK')).not.toBeNull();
    expect(within(out).getByText('3 patches OK')).not.toBeNull();
    expect(within(out).getByText('1 failed')).not.toBeNull();
    expect(within(out).getByText('Receipt to push median 1.8 s')).not.toBeNull();
    expect(within(out).getByText('Failures')).not.toBeNull();
  });

  it('shows 0% for zero transactions, No delivery, success health, and no failed chip when nothing failed', () => {
    const s = makeSummaryFixture();
    render(<StageCards summary={makeSummaryFixture({
      In: { ...s.In, LastDeliveryUtc: null, Rejected: 0 },
      Tagging: { ...s.Tagging, Transactions: 0, Tagged: 0, Untagged: 0, LayersDiffer: 0 },
      KnowledgeBase: { ...s.KnowledgeBase, Pending: 0, FailedCalls: 0 },
      Out: { ...s.Out, PushesFailed: 0, PatchesFailed: 0, RowsLastCallFailed: 0, RowsNotSent: 0 },
    })} withDate />);
    expect(screen.getByText('0%')).not.toBeNull();
    expect(screen.getByText('No delivery')).not.toBeNull();
    expect(screen.getByText('All tagged')).not.toBeNull();
    expect(screen.queryByText(/failed$/)).toBeNull();
    expect(screen.getAllByText('OK')).toHaveLength(3);
  });

  it('dims card 3, hides its chips and the certainty bar, and explains when the knowledge base is off; red health on rejections', () => {
    const s = makeSummaryFixture();
    render(<StageCards summary={makeSummaryFixture({ In: { ...s.In, Rejected: 2 }, KnowledgeBase: { ...s.KnowledgeBase, Active: false } })} withDate={false} />);
    const kb = screen.getByRole('region', { name: 'Knowledge base' });
    expect(kb.className).toContain('opacity-60');
    expect(within(kb).getByText('Knowledge base not enabled on this environment')).not.toBeNull();
    expect(within(kb).queryByText('4 pending')).toBeNull();
    expect(within(kb).queryByLabelText('By certainty')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'In from BwaTech' })).getByText('Rejections')).not.toBeNull();
  });

  it('is memoized so a parent re-render with the same props skips it', () => {
    expect((StageCards as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
