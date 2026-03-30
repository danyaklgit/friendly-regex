import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownBackdrop } from './DropdownBackdrop';

describe('DropdownBackdrop', () => {
  it('renders a fixed overlay into document.body', () => {
    const { unmount } = render(<DropdownBackdrop />);
    const backdrop = document.body.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    unmount();
  });

  it('calls onClick when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { unmount } = render(<DropdownBackdrop onClick={onClick} />);
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    await user.click(backdrop);
    expect(onClick).toHaveBeenCalledOnce();
    unmount();
  });

  it('renders without an onClick prop without errors', () => {
    const { unmount } = render(<DropdownBackdrop />);
    expect(document.body.querySelector('.fixed.inset-0')).not.toBeNull();
    unmount();
  });
});
