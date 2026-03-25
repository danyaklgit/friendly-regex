import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders the trigger child', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.getByText('Hover me')).toBeDefined();
  });

  it('does not show tooltip content by default', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('shows tooltip on hover', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Help text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    await user.hover(screen.getByText('Hover me'));
    expect(screen.getByText('Help text')).toBeDefined();
  });

  it('hides tooltip when unhovered', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Help text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    await user.hover(screen.getByText('Hover me'));
    expect(screen.getByText('Help text')).toBeDefined();
    await user.unhover(screen.getByText('Hover me'));
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('accepts custom placement', () => {
    render(
      <Tooltip content="Bottom tip" placement="bottom">
        <button>Trigger</button>
      </Tooltip>
    );
    expect(screen.getByText('Trigger')).toBeDefined();
  });

  it('accepts custom offset', () => {
    render(
      <Tooltip content="Offset tip" offsetAmount={12}>
        <button>Trigger</button>
      </Tooltip>
    );
    expect(screen.getByText('Trigger')).toBeDefined();
  });
});
