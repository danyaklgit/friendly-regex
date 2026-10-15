import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KbStatusBadge, OutStatusBadge, CertaintyPill, AccountStateBadge, FeedChip, CallBadge, HealthBadge } from './StatusBadges';
import { makeCallFixture } from '../../utils/clientSync/fixtures';

describe('StatusBadges', () => {
  it('KB status: label and tone class; NotEligible is a dash in the list and an outline in the drawer', () => {
    const { container, rerender } = render(<KbStatusBadge status="Promoted" context="list" />);
    expect(screen.getByText('Promoted').closest('span.inline-flex')?.className).toContain('bg-green-100');
    rerender(<KbStatusBadge status="NotEligible" context="list" />);
    expect(container.textContent).toBe('—');
    rerender(<KbStatusBadge status="NotEligible" context="drawer" />);
    expect(screen.getByText('Not eligible').closest('span.inline-flex')?.className).toContain('border-border-strong');
  });

  it('certainty pill colors by rank and keeps the raw label; empty certainty renders nothing', () => {
    const { container, rerender } = render(<CertaintyPill certainty="Confirmed" rank={5} />);
    expect(screen.getByText('Confirmed').closest('span.inline-flex')?.className).toContain('bg-emerald-100');
    rerender(<CertaintyPill certainty="HIGH" rank={5} />);
    expect(screen.getByText('HIGH').closest('span.inline-flex')?.className).toContain('bg-emerald-100');
    rerender(<CertaintyPill certainty="Unlikely" rank={1} />);
    expect(screen.getByText('Unlikely').closest('span.inline-flex')?.className).toContain('bg-red-100');
    rerender(<CertaintyPill certainty="" rank={0} />);
    expect(container.textContent).toBe('');
  });

  it('outbound status, account state, feed chip and health', () => {
    const { container, rerender } = render(<OutStatusBadge status="FAILED" title="timeout" />);
    expect(screen.getByText('Failed').getAttribute('title')).toBe('timeout');
    expect(screen.getByText('Failed').closest('span.inline-flex')?.className).toContain('bg-red-100');
    rerender(<OutStatusBadge status="NEVER" />);
    expect(container.textContent).toBe('—');
    rerender(<AccountStateBadge state="IDLE" />);
    expect(screen.getByText('No delivery').closest('span.inline-flex')?.className).toContain('bg-gray-100');
    rerender(<FeedChip dataSetType="INTERIM_TransactionsList" isArchived />);
    expect(screen.getByText('INTERIM TL')).not.toBeNull();
    expect(screen.getByText('archived')).not.toBeNull();
    rerender(<FeedChip dataSetType="MT940" isArchived={false} />);
    expect(screen.queryByText('archived')).toBeNull();
    rerender(<HealthBadge health={{ tone: 'danger', label: 'Failures' }} />);
    expect(screen.getByText('Failures').closest('span.inline-flex')?.className).toContain('bg-red-100');
  });

  it('call badge: StatusCode text, tone by Succeeded, description as title', () => {
    const { rerender } = render(<CallBadge call={makeCallFixture({ StatusCode: '0', StatusDescription: 'OK', Succeeded: true })} />);
    expect(screen.getByText('0').getAttribute('title')).toBe('OK');
    expect(screen.getByText('0').closest('span.inline-flex')?.className).toContain('bg-green-100');
    rerender(<CallBadge call={makeCallFixture({ StatusCode: '500', StatusDescription: null, Succeeded: false })} />);
    expect(screen.getByText('500').closest('span.inline-flex')?.className).toContain('bg-red-100');
  });
});
