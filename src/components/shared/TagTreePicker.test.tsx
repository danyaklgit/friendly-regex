import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagTreePicker } from './TagTreePicker';
import type { TagTreeNode } from '../../api/tagsHierarchy';

const leafNode = (tag: string, name: string): TagTreeNode => ({
  tag,
  name,
  description: `${name} description`,
  level: 'T',
  statusTag: '',
  children: [],
});

const groupNode = (tag: string, children: TagTreeNode[]): TagTreeNode => ({
  tag,
  name: tag,
  description: '',
  level: 'G',
  statusTag: '',
  children,
});

const nodes: TagTreeNode[] = [
  groupNode('Expenses', [
    leafNode('SALARY', 'Salary Payment'),
    leafNode('RENT', 'Rent Payment'),
  ]),
  groupNode('Income', [
    leafNode('REVENUE', 'Revenue'),
  ]),
];

describe('TagTreePicker', () => {
  it('renders label', () => {
    render(
      <TagTreePicker label="Parent Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('Parent Tag')).toBeDefined();
  });

  it('shows required indicator', () => {
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} required />
    );
    expect(screen.getByText('*')).toBeDefined();
  });

  it('shows loading state', () => {
    render(
      <TagTreePicker label="Tag" nodes={[]} value="" onChange={vi.fn()} loading />
    );
    expect(screen.getByText('Loading tags...')).toBeDefined();
  });

  it('shows empty state when no nodes', () => {
    render(
      <TagTreePicker label="Tag" nodes={[]} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('No tags available')).toBeDefined();
  });

  it('renders group nodes', () => {
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('Expenses')).toBeDefined();
    expect(screen.getByText('Income')).toBeDefined();
  });

  it('expands group on click to show children', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    // Children hidden by default (defaultExpanded=false)
    expect(screen.queryByText('SALARY')).toBeNull();
    await user.click(screen.getByText('Expenses'));
    expect(screen.getByText('SALARY')).toBeDefined();
    expect(screen.getByText('RENT')).toBeDefined();
  });

  it('collapses group on second click', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    await user.click(screen.getByText('Expenses'));
    expect(screen.getByText('SALARY')).toBeDefined();
    await user.click(screen.getByText('Expenses'));
    expect(screen.queryByText('SALARY')).toBeNull();
  });

  it('calls onChange when leaf clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={onChange} />
    );
    await user.click(screen.getByText('Expenses'));
    await user.click(screen.getByText('SALARY'));
    expect(onChange).toHaveBeenCalledWith('SALARY');
  });

  it('shows selected tag indicator', () => {
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="SALARY" onChange={vi.fn()} />
    );
    expect(screen.getByText('Selected:')).toBeDefined();
    expect(screen.getByText(/SALARY - Salary Payment/)).toBeDefined();
  });

  it('filters by search query', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText('Search tags...');
    await user.type(input, 'salary');
    expect(screen.getByText('SALARY')).toBeDefined();
    expect(screen.queryByText('RENT')).toBeNull();
  });

  it('shows no results message for non-matching search', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Search tags...'), 'zzzzz');
    expect(screen.getByText('No tags match your search')).toBeDefined();
  });

  it('applies error border class', () => {
    const { container } = render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} error />
    );
    const borderDiv = container.querySelector('.border-red-400');
    expect(borderDiv).not.toBeNull();
  });

  it('handles non-array nodes gracefully', () => {
    render(
      <TagTreePicker label="Tag" nodes={null as any} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('No tags available')).toBeDefined();
  });

  it('shows tag name when different from tag', () => {
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="SALARY" onChange={vi.fn()} />
    );
    // The selected indicator should show the name
    expect(screen.getByText(/Salary Payment/)).toBeDefined();
  });

  it('searches by description', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="" onChange={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Search tags...'), 'description');
    // All leaves have "description" in their description field
    expect(screen.getByText('SALARY')).toBeDefined();
    expect(screen.getByText('RENT')).toBeDefined();
    expect(screen.getByText('REVENUE')).toBeDefined();
  });

  it('applies selected styling to expanded leaf', async () => {
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={nodes} value="SALARY" onChange={vi.fn()} />
    );
    await user.click(screen.getByText('Expenses'));
    const salaryBtn = screen.getByText('SALARY').closest('button')!;
    expect(salaryBtn.className).toContain('bg-primary/10');
  });

  it('shows only tag when name equals tag', () => {
    const sameNameNodes: TagTreeNode[] = [
      groupNode('G1', [leafNode('SAME', 'SAME')]),
    ];
    render(
      <TagTreePicker label="Tag" nodes={sameNameNodes} value="SAME" onChange={vi.fn()} />
    );
    const selectedText = screen.getByText('Selected:').parentElement!.textContent;
    expect(selectedText).toContain('SAME');
    expect(selectedText).not.toContain(' - ');
  });

  it('deduplicates search results', async () => {
    const dupeNodes: TagTreeNode[] = [
      groupNode('G1', [leafNode('SALARY', 'Salary Payment')]),
      groupNode('G2', [leafNode('SALARY', 'Salary Payment')]),
    ];
    const user = userEvent.setup();
    render(
      <TagTreePicker label="Tag" nodes={dupeNodes} value="" onChange={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Search tags...'), 'salary');
    const matches = screen.getAllByText('SALARY');
    expect(matches).toHaveLength(1);
  });
});
