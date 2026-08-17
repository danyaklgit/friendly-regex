import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useTransactionData.
vi.mock('../../hooks/useTransactionData', () => ({
  useTransactionData: () => ({
    filterDefinitions: [
      {
        Tag: 'BANKS',
        Label: 'Banks',
        Type: 'LIST' as const,
        Operand: null,
        Values: [
          { Column: 'ARNB', Value: 'ARNB', Label: 'Arab National Bank', Operand: null, DisabledBy: null },
        ],
      },
    ],
  }),
}));

import { SharedLinkBanner } from './SharedLinkBanner';
import type { ShareParams } from '../../utils/shareLink';

function makeShare(overrides?: Partial<ShareParams>): ShareParams {
  return {
    bank: 'ARNB',
    side: 'CR',
    dataSetType: 'MT940',
    filters: { BANKS: new Set(['ARNB']) },
    sharedBy: 'Nadim Ayoub',
    ...overrides,
  };
}

describe('SharedLinkBanner', () => {
  it('renders the Shared View header', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText('Shared View')).toBeDefined();
  });

  it('renders the shared-by name', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText('Nadim Ayoub')).toBeDefined();
  });

  it('renders the SHARED BY section header', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText('Shared by')).toBeDefined();
  });

  it('renders filter chips with resolved labels', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText('Arab National Bank')).toBeDefined();
  });

  it('renders filter key label from definitions', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText((_, el) => el?.textContent === 'Banks:')).toBeDefined();
  });

  it('falls back to humanizeFieldName for __tags key', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { __tags: new Set(['FOO']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Tags:')).toBeDefined();
  });

  it('handles data: prefixed keys', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { 'data:BeneficiaryName': new Set(['John']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Beneficiary Name:')).toBeDefined();
  });

  it('handles __dates key', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { __dates: new Set(['2024-01-01']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Dates:')).toBeDefined();
  });

  it('handles __debit key', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { __debit: new Set(['100']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Debit Amount:')).toBeDefined();
  });

  it('handles __credit key', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { __credit: new Set(['200']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Credit Amount:')).toBeDefined();
  });

  it('handles _GTE suffix', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { Amount_GTE: new Set(['50']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Amount (min):')).toBeDefined();
  });

  it('handles _LTE suffix', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { Amount_LTE: new Set(['200']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Amount (max):')).toBeDefined();
  });

  it('falls back to humanizeFieldName for a plain unknown key', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { SomeRandomField: new Set(['val']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('Some Random Field:')).toBeDefined();
  });

  it('resolveValueLabel skips special keys', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { __tags: new Set(['RAW']), X_GTE: new Set(['10']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('RAW')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
  });

  it('resolveValueLabel falls back when no def matches', () => {
    render(<SharedLinkBanner share={makeShare({ filters: { UnknownTag: new Set(['raw_value']) } })} onDismiss={() => {}} />);
    expect(screen.getByText('raw_value')).toBeDefined();
  });

  it('does not render filter section when filters are empty', () => {
    const { container } = render(<SharedLinkBanner share={makeShare({ filters: {} })} onDismiss={() => {}} />);
    expect(container.textContent).not.toContain('Filters');
  });

  it('renders the note when present', () => {
    render(<SharedLinkBanner share={makeShare({ note: 'Check this out' })} onDismiss={() => {}} />);
    expect(screen.getByText('Check this out')).toBeDefined();
  });

  it('does not render note section when note is absent', () => {
    const { container } = render(<SharedLinkBanner share={makeShare({ note: undefined })} onDismiss={() => {}} />);
    expect(container.textContent).not.toContain('Note');
  });

  it('renders View Transactions button', () => {
    render(<SharedLinkBanner share={makeShare()} onDismiss={() => {}} />);
    expect(screen.getByText('View Transactions')).toBeDefined();
  });

  it('calls onDismiss when View Transactions is clicked', () => {
    const onDismiss = vi.fn();
    render(<SharedLinkBanner share={makeShare()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('View Transactions'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when clicking the backdrop', () => {
    const onDismiss = vi.fn();
    const { container } = render(<SharedLinkBanner share={makeShare()} onDismiss={onDismiss} />);
    // Backdrop is the second div (bg-black)
    const backdrop = container.querySelector('.bg-black\\/10');
    if (backdrop) fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
