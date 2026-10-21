import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceStepOut } from './TraceStepOut';
import { makeTraceFixture, makeOutCallFixture, makeCurrentViewFixture, makeKbMatchFixture, makeMatchPartyFixture } from '../../utils/clientSync/fixtures';

describe('TraceStepOut', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('lists calls oldest first with operation labels and counts, tabs This row | Response, and what BwaTech holds now grouped by default', async () => {
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
    expect(within(holds).queryByText(/Deleted at BwaTech/)).toBeNull();
    expect((within(holds).getByRole('radio', { name: 'Grouped' }) as HTMLInputElement).getAttribute('aria-checked')).toBe('true');

    // TEP attributes: every key that does not start kb_, as plain key and value rows.
    const tep = within(holds).getByRole('region', { name: 'TEP attributes' });
    expect(within(tep).getByText('SenderBank')).not.toBeNull();
    expect(within(tep).getByText('80')).not.toBeNull();
    expect(within(tep).getByText('every key that does not start kb_')).not.toBeNull();

    // The displayed customer with its pills and the link to the match it comes from.
    const displayed = within(holds).getByRole('region', { name: 'Displayed customer' });
    expect(within(displayed).getAllByText('Al Noor International Company').length).toBeGreaterThan(0);
    expect(within(displayed).getByText('Hierarchy level')).not.toBeNull();
    expect(within(displayed).getByText('kb_displayed_customer_type')).not.toBeNull();
    const link = within(displayed).getByRole('button', { name: 'match #0 · Head office' });

    // One card per match, expanded, parties top-down with the head office stepped in under the franchise.
    const m0 = within(holds).getByRole('region', { name: 'Match #0' });
    const m2 = within(holds).getByRole('region', { name: 'Match #2' });
    expect(within(m0).getByText('no suffix')).not.toBeNull();
    expect(within(m2).getByText('_2')).not.toBeNull();
    expect(within(m0).getAllByText('STRONG').length).toBeGreaterThan(0);
    const franchise = within(m0).getByLabelText('Franchise');
    const ho = within(m0).getByLabelText('Head office');
    expect(franchise.className).not.toContain('ml-');
    expect(ho.className).toContain('ml-5');
    expect(within(ho).getByText('Displayed')).not.toBeNull();
    expect(within(franchise).queryByText('Displayed')).toBeNull();
    expect(within(franchise).getByText('Name (EN)')).not.toBeNull();
    expect(within(franchise).getByText('Al Noor International Company Grocery')).not.toBeNull();
    expect(within(franchise).getByText('kb_franchise_customer_name_en')).not.toBeNull();
    expect(within(m0).getByText('Allocation certainty')).not.toBeNull();
    expect(within(m0).getByText('kb_customer_type')).not.toBeNull();

    // A key the layout does not know: still listed, with a dash for its label and an amber key, in its own match only.
    expect(within(m2).getByText('kb_new_signal_2').className).toContain('text-amber');
    expect(within(m2).getByText('x7')).not.toBeNull();
    expect(within(m2).getByText(/A key the layout does not know/)).not.toBeNull();
    expect(within(m0).queryByText(/A key the layout does not know/)).toBeNull();
    expect(within(m2).getByText('kb_customer_type_2').className).not.toContain('text-amber');

    // Collapse one match: its body goes, the header names its summary party.
    await user.click(within(m2).getByRole('button', { expanded: true }));
    expect(within(m2).getByRole('button', { expanded: false })).not.toBeNull();
    expect(within(m2).queryByText('kb_new_signal_2')).toBeNull();
    expect(within(m2).getByText('Head office 3400112233 · Al Noor Grocery')).not.toBeNull();

    // Collapse all while any match is open, then expand all.
    await user.click(within(holds).getByRole('button', { name: 'Collapse all' }));
    expect(within(m0).getByText('Head office 11223344556 · Al Noor International Company')).not.toBeNull();
    expect(within(m0).queryByText('kb_customer_type')).toBeNull();
    await user.click(within(holds).getByRole('button', { name: 'Expand all' }));
    expect(within(m0).getByText('kb_customer_type')).not.toBeNull();
    expect(within(m2).getByText('kb_new_signal_2')).not.toBeNull();

    // The displayed link expands its match, scrolls to the party that carries the code and flashes it.
    await user.click(within(holds).getByRole('button', { name: 'Collapse all' }));
    await user.click(link);
    expect(within(m0).getByRole('button', { expanded: true })).not.toBeNull();
    expect(within(m0).getByLabelText('Head office').className).toContain('tep-col-flash');
    expect(within(m0).getByLabelText('Franchise').className).not.toContain('tep-col-flash');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });

    // As sent: the flat list exactly as the backend holds it, kb_ keys tinted.
    await user.click(within(holds).getByRole('radio', { name: 'As sent' }));
    expect(within(holds).queryByRole('region', { name: 'TEP attributes' })).toBeNull();
    expect(within(holds).getByText('kb_customer_code').className).toContain('text-primary');
    expect(within(holds).getByText('payer_name').className).not.toContain('text-primary');
    await user.click(within(holds).getByRole('radio', { name: 'Grouped' }));
    expect(within(holds).getByRole('region', { name: 'TEP attributes' })).not.toBeNull();
  });

  it('falls back to viewer buttons when texts are null and files exist, shows the deleted note, and offers the flat list only when the backend sends no grouped view', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const call = makeOutCallFixture({ ElementJson: null, ResponseText: null });
    render(<TraceStepOut data={{ Calls: [call], CurrentTag: null, CurrentAttributes: [], DeletedAtBwatech: true, CurrentView: null }} outStatus="DELETED" withDate={false} onOpenFile={onOpenFile} />);
    await user.click(screen.getByRole('button', { name: 'Open the full request' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'request');
    await user.click(screen.getByRole('radio', { name: 'Response' }));
    await user.click(screen.getByRole('button', { name: 'Open the full response' }));
    expect(onOpenFile).toHaveBeenLastCalledWith(call, 'response');
    expect(screen.getByText('Deleted at BwaTech (patch action 2)')).not.toBeNull();
    expect(screen.getByText('No tag held.')).not.toBeNull();
    expect(screen.getByText('No attributes held')).not.toBeNull();
    expect(screen.queryByRole('radio', { name: 'As sent' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Grouped' })).toBeNull();
  });

  it('shows an empty grouped view for a row without a knowledge-base answer, and no matches section when only TEP keys are held', () => {
    const data = makeTraceFixture().Out;
    const { unmount } = render(<TraceStepOut data={{ ...data, CurrentView: { Tep: [], Displayed: null, Matches: [] } }} outStatus="SENT" withDate={false} onOpenFile={() => {}} />);
    const holds = screen.getByLabelText('What BwaTech holds now');
    expect(within(holds).getByRole('radio', { name: 'As sent' })).not.toBeNull();
    expect(within(holds).getByText('No attributes held')).not.toBeNull();
    unmount();

    render(<TraceStepOut data={{ ...data, CurrentView: makeCurrentViewFixture({ Displayed: null, Matches: [] }) }} outStatus="SENT" withDate={false} onOpenFile={() => {}} />);
    const only = screen.getByLabelText('What BwaTech holds now');
    expect(within(only).getByRole('region', { name: 'TEP attributes' })).not.toBeNull();
    expect(within(only).queryByRole('region', { name: 'Displayed customer' })).toBeNull();
    expect(within(only).queryByRole('button', { name: /all$/ })).toBeNull();
    expect(within(only).queryByText('No attributes held')).toBeNull();
  });

  it('renders a displayed customer without a match link, a new party level flush with a title from its level, and a blank value as a dash', () => {
    const data = makeTraceFixture().Out;
    const base = makeCurrentViewFixture();
    const view = makeCurrentViewFixture({
      Displayed: base.Displayed && { ...base.Displayed, MatchNumber: null, MatchLevel: null, NameEn: null },
      Matches: [makeKbMatchFixture({
        Parties: [
          makeMatchPartyFixture({ Level: 'HO', IsDisplayed: false }),
          makeMatchPartyFixture({ Level: 'REGION', Title: 'Region', Code: 'R1', NameEn: 'West', IsDisplayed: false, Attributes: [{ Key: 'kb_region_code', Value: ' ', Label: 'Region code' }] }),
        ],
      })],
    });
    render(<TraceStepOut data={{ ...data, CurrentView: view }} outStatus="SENT" withDate={false} onOpenFile={() => {}} />);
    const holds = screen.getByLabelText('What BwaTech holds now');
    const displayed = within(holds).getByRole('region', { name: 'Displayed customer' });
    expect(within(displayed).queryByRole('button')).toBeNull();
    expect(within(displayed).getAllByText('11223344556').length).toBeGreaterThan(0);
    const m0 = within(holds).getByRole('region', { name: 'Match #0' });
    expect(within(m0).getByLabelText('Head office').className).not.toContain('ml-');
    const region = within(m0).getByLabelText('Region');
    expect(region.className).not.toContain('ml-');
    expect(within(region).getByText('Region code')).not.toBeNull();
    expect(within(region).getByText('—')).not.toBeNull();
  });
});
