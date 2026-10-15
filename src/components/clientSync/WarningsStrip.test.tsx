import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WarningsStrip } from './WarningsStrip';
import { makeWarningFixture } from '../../utils/clientSync/fixtures';

describe('WarningsStrip', () => {
  it('renders nothing for an empty array', () => {
    const { container } = render(<WarningsStrip warnings={[]} onShow={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a clickable row when Show is set and a plain row otherwise, styled by level', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <WarningsStrip
        warnings={[
          makeWarningFixture(),
          makeWarningFixture({ Level: 'INFO', Code: 'STALE', IBAN: null, Count: null, Message: 'Nothing new since 07:55.', Show: null }),
        ]}
        onShow={onShow}
      />,
    );
    const button = screen.getByRole('button', { name: /5 rows failed on the last push/ });
    expect(button.getAttribute('title')).toBe('Show these rows');
    expect(button.className).toContain('amber');
    expect(button.textContent).toContain('OUT_FAILED');
    expect(button.textContent).toContain('SA03 8000 0000 6080 1016 7519');
    await user.click(button);
    expect(onShow).toHaveBeenCalledWith('OUT_FAILED');

    const info = screen.getByText('Nothing new since 07:55.').closest('div');
    expect(info?.className).toContain('cyan');
    expect(screen.queryByRole('button', { name: /Nothing new/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
