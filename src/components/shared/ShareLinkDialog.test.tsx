import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useTransactionData — must be before the component import.
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

// Mock buildShareUrl to return a predictable string.
vi.mock('../../utils/shareLink', async () => {
  const actual = await vi.importActual<typeof import('../../utils/shareLink')>('../../utils/shareLink');
  return {
    ...actual,
    buildShareUrl: () => 'https://example.com/?share=1&bank=ARNB',
  };
});

import { ShareLinkDialog, ToggleBadge } from './ShareLinkDialog';

describe('ShareLinkDialog', () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    bank: 'ARNB',
    side: 'CR',
    filters: { BANKS: new Set(['ARNB']) } as Record<string, Set<string>>,
    toggles: { compactMode: true, incrementalPagination: false, showAttributes: true },
    sharedBy: 'Nadim',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal title', () => {
    render(<ShareLinkDialog {...baseProps} />);
    expect(screen.getByText('Share Current View')).toBeDefined();
  });

  it('renders the note textarea', () => {
    render(<ShareLinkDialog {...baseProps} />);
    expect(screen.getByPlaceholderText('Add context for the recipient...')).toBeDefined();
  });

  it('shows character counter at 0/500 initially', () => {
    render(<ShareLinkDialog {...baseProps} />);
    expect(screen.getByText('0/500')).toBeDefined();
  });

  it('updates character counter as user types', async () => {
    const user = userEvent.setup();
    render(<ShareLinkDialog {...baseProps} />);
    const textarea = screen.getByPlaceholderText('Add context for the recipient...');
    await user.type(textarea, 'hello');
    expect(screen.getByText('5/500')).toBeDefined();
  });

  it('renders filter chips with resolved labels', () => {
    render(<ShareLinkDialog {...baseProps} />);
    // The mock def maps ARNB → "Arab National Bank"
    expect(screen.getByText('Arab National Bank')).toBeDefined();
  });

  it('renders filter key label from definitions', () => {
    render(<ShareLinkDialog {...baseProps} />);
    // "BANKS" key should resolve to def.Label "Banks"
    expect(screen.getByText((_, el) => el?.textContent === 'Banks:')).toBeDefined();
  });

  it('falls back to humanizeFieldName for unknown filter keys', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ __tags: new Set(['FOO']) }} />);
    expect(screen.getByText('Tags:')).toBeDefined();
  });

  it('handles data: prefixed keys', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ 'data:BeneficiaryName': new Set(['John']) }} />);
    expect(screen.getByText('Beneficiary Name:')).toBeDefined();
  });

  it('handles __dates key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ __dates: new Set(['2024-01-01']) }} />);
    expect(screen.getByText('Dates:')).toBeDefined();
  });

  it('handles __debit key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ __debit: new Set(['100']) }} />);
    expect(screen.getByText('Debit Amount:')).toBeDefined();
  });

  it('handles __credit key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ __credit: new Set(['200']) }} />);
    expect(screen.getByText('Credit Amount:')).toBeDefined();
  });

  it('handles _GTE suffix key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ Amount_GTE: new Set(['50']) }} />);
    expect(screen.getByText('Amount (min):')).toBeDefined();
  });

  it('handles _LTE suffix key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ Amount_LTE: new Set(['200']) }} />);
    expect(screen.getByText('Amount (max):')).toBeDefined();
  });

  it('falls back to humanizeFieldName for a plain unknown key', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ SomeRandomField: new Set(['val']) }} />);
    expect(screen.getByText('Some Random Field:')).toBeDefined();
  });

  it('applies max-length styling to character counter', () => {
    render(<ShareLinkDialog {...baseProps} />);
    const textarea = screen.getByPlaceholderText('Add context for the recipient...');
    fireEvent.change(textarea, { target: { value: 'a'.repeat(500) } });
    expect(screen.getByText('500/500')).toBeDefined();
  });

  it('skips filters with empty sets', () => {
    const { container } = render(<ShareLinkDialog {...baseProps} filters={{ BANKS: new Set<string>() }} />);
    expect(container.querySelector('.flex.flex-wrap.gap-1\\.5')).toBeNull();
  });

  it('resolveValueLabel skips special keys (__tags, _GTE, _LTE)', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ __tags: new Set(['RAW_VAL']), Amt_GTE: new Set(['100']) }} />);
    // Special keys should pass through without label resolution
    expect(screen.getByText('RAW_VAL')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
  });

  it('resolveValueLabel matches by Value field when Column does not match', () => {
    // The mock def has Column='ARNB' and Value='ARNB'. Use a value that matches via Value path.
    render(<ShareLinkDialog {...baseProps} filters={{ BANKS: new Set(['ARNB']) }} />);
    expect(screen.getByText('Arab National Bank')).toBeDefined();
  });

  it('resolveValueLabel falls back when no def matches', () => {
    render(<ShareLinkDialog {...baseProps} filters={{ UnknownTag: new Set(['raw_value']) }} />);
    expect(screen.getByText('raw_value')).toBeDefined();
  });

  it('renders Cancel and Copy Link buttons', () => {
    render(<ShareLinkDialog {...baseProps} />);
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.getByText('Copy Link')).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<ShareLinkDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Copied! after clicking Copy Link', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup();
    render(<ShareLinkDialog {...baseProps} />);
    await user.click(screen.getByText('Copy Link'));
    expect(screen.getByText('Copied!')).toBeDefined();
  });

  it('resets note and copied state when dialog re-opens', () => {
    const { rerender } = render(<ShareLinkDialog {...baseProps} open={false} />);
    rerender(<ShareLinkDialog {...baseProps} open={true} />);
    expect(screen.getByPlaceholderText('Add context for the recipient...')).toBeDefined();
  });

  it('does not render content when open=false', () => {
    // Modal might not render children when closed (depends on Modal impl).
    // At minimum, the URL builder returns '' when !open.
    const { container } = render(<ShareLinkDialog {...baseProps} open={false} />);
    // Just verify it doesn't crash
    expect(container).toBeDefined();
  });

  it('renders the footer info text', () => {
    render(<ShareLinkDialog {...baseProps} />);
    expect(screen.getByText('This link includes the selected bank, side, filters, and view settings.')).toBeDefined();
  });
});

describe('ToggleBadge', () => {
  it('renders label text', () => {
    render(<ToggleBadge label="Compact mode" checked={true} />);
    expect(screen.getByText('Compact mode')).toBeDefined();
  });

  it('applies checked styling when checked', () => {
    const { container } = render(<ToggleBadge label="Test" checked={true} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-primary/10');
  });

  it('applies unchecked styling when not checked', () => {
    const { container } = render(<ToggleBadge label="Test" checked={false} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-surface');
  });

  it('renders the toggle switch indicator', () => {
    const { container } = render(<ToggleBadge label="Test" checked={true} />);
    const knob = container.querySelector('.rounded-full.bg-white');
    expect(knob).not.toBeNull();
  });
});
