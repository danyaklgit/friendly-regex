import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KvList } from './KvList';

describe('KvList', () => {
  it('renders keys and values with a mandatory dot, red invalid values, a dash for null, and highlighted keys', () => {
    render(
      <KvList
        label="Attributes"
        items={[
          { key: 'payer_name', value: 'AL FARIS CO', isMandatory: true, isValid: true },
          { key: 'invoice', value: 'INV-1', isMandatory: false, isValid: false },
          { key: 'kb_customer_code', value: null },
        ]}
        highlightKey={(k) => k.startsWith('kb_')}
      />,
    );
    const list = screen.getByRole('list', { name: 'Attributes' });
    expect(list).not.toBeNull();
    expect(screen.getByText('payer_name').querySelector('[aria-label="mandatory"]')).not.toBeNull();
    expect(screen.getByText('invoice').querySelector('[aria-label="mandatory"]')).toBeNull();
    expect(screen.getByText('INV-1').className).toContain('text-red-600');
    expect(screen.getByText('AL FARIS CO').className).not.toContain('text-red-600');
    expect(screen.getByText('—')).not.toBeNull();
    expect(screen.getByText('kb_customer_code').className).toContain('text-primary');
    expect(screen.getByText('payer_name').className).not.toContain('text-primary');
  });

  it('shows the empty label when there are no items', () => {
    render(<KvList items={[]} emptyLabel="No attributes extracted" />);
    expect(screen.getByText('No attributes extracted')).not.toBeNull();
  });
});
