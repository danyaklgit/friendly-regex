import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('renders label, value, and caption', () => {
    render(<KpiTile label="Untagged" value="58,286" caption="waiting for a rule" />);
    expect(screen.getByText('Untagged')).toBeDefined();
    expect(screen.getByText('58,286')).toBeDefined();
    expect(screen.getByText('waiting for a rule')).toBeDefined();
  });

  it('renders the hero value larger', () => {
    render(<KpiTile label="Tagging rate" value="46.5%" hero />);
    expect(screen.getByText('46.5%').className).toContain('text-5xl');
  });

  it('renders the regular value at the standard size', () => {
    render(<KpiTile label="Transactions" value="108,910" />);
    expect(screen.getByText('108,910').className).toContain('text-2xl');
  });
});
