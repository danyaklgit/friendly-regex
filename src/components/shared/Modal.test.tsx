import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders title and content when open', () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Modal">
        <p>Modal body</p>
      </Modal>
    );
    expect(screen.getByText('My Modal')).toBeDefined();
    expect(screen.getByText('Modal body')).toBeDefined();
  });

  it('renders footer when provided', () => {
    render(
      <Modal open={true} onClose={() => {}} title="With Footer" footer={<button>Save</button>}>
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByText('Save')).toBeDefined();
  });

  it('does not render footer when not provided', () => {
    render(
      <Modal open={true} onClose={() => {}} title="No Footer">
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Closable">
        <p>Body</p>
      </Modal>
    );
    // The close button contains an SVG, find the button near the title
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]); // close button
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} title="Backdrop">
        <p>Body</p>
      </Modal>
    );
    // The backdrop is the div with bg-black/10 class
    const backdrop = container.querySelector('.bg-black\\/10');
    if (backdrop) await user.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sets overflow hidden on body when open', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Scroll Lock">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores overflow on close', () => {
    const { rerender } = render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('');
  });
});
