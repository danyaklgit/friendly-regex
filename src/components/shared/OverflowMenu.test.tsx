import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverflowMenu } from './OverflowMenu';

describe('OverflowMenu', () => {
  it('does not render the menu surface until the trigger is clicked', () => {
    render(
      <OverflowMenu
        items={[{ label: 'First', onClick: vi.fn() }]}
      />,
    );
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('opens on trigger click and renders all items', async () => {
    const user = userEvent.setup();
    render(
      <OverflowMenu
        items={[
          { label: 'First', onClick: vi.fn() },
          { label: 'Second', onClick: vi.fn() },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
  });

  it('fires onClick and closes the menu on item selection', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OverflowMenu items={[{ label: 'Rollback', onClick }]} />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem'));
    expect(onClick).toHaveBeenCalledOnce();
    // Menu should be closed afterwards.
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <OverflowMenu items={[{ label: 'Rollback', onClick: vi.fn() }]} />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('does not fire onClick for disabled items', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OverflowMenu items={[{ label: 'Rollback', onClick, disabled: true }]} />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents the menu from opening when the trigger is disabled', async () => {
    const user = userEvent.setup();
    render(
      <OverflowMenu
        disabled
        items={[{ label: 'Rollback', onClick: vi.fn() }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('renders danger items with red styling', async () => {
    const user = userEvent.setup();
    render(
      <OverflowMenu
        items={[{ label: 'Rollback', onClick: vi.fn(), danger: true }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const item = screen.getByRole('menuitem');
    // Tailwind class for the danger color path — keeps the test resilient
    // to layout shuffling without coupling to inline styles.
    expect(item.className).toMatch(/text-red-600/);
  });

  it('honours the triggerTitle prop (hover hint)', () => {
    render(
      <OverflowMenu
        triggerTitle="Locked while tagging is in progress"
        items={[{ label: 'Rollback', onClick: vi.fn() }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger.getAttribute('title')).toBe('Locked while tagging is in progress');
  });
});
