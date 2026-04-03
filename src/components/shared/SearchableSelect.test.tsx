import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from './SearchableSelect';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', sublabel: 'Second letter' },
  { value: 'c', label: 'Gamma' },
];

describe('SearchableSelect', () => {
  beforeEach(() => {
    // Clean up portalled elements between tests
    document.body.querySelectorAll('.fixed').forEach((el) => el.remove());
  });

  it('renders with placeholder when no value selected', () => {
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    expect(screen.getByRole('button').textContent).toContain('Select…');
  });

  it('renders with custom placeholder', () => {
    render(<SearchableSelect value="" onChange={() => {}} options={options} placeholder="Pick one" />);
    expect(screen.getByRole('button').textContent).toContain('Pick one');
  });

  it('shows the selected label for a matching value', () => {
    render(<SearchableSelect value="b" onChange={() => {}} options={options} />);
    expect(screen.getByRole('button').textContent).toContain('Beta');
  });

  it('falls back to the raw value when no option matches', () => {
    render(<SearchableSelect value="unknown" onChange={() => {}} options={options} />);
    expect(screen.getByRole('button').textContent).toContain('unknown');
  });

  it('opens dropdown when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.getByText('Gamma')).toBeDefined();
  });

  it('shows sublabels in the dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Second letter')).toBeDefined();
  });

  it('calls onChange and closes dropdown when an option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="" onChange={onChange} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
    // Dropdown should be closed — search input should be gone
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('filters options by label', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'alp');
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.queryByText('Gamma')).toBeNull();
  });

  it('filters options by value', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'b');
    // 'b' matches value "b" (Beta) and sublabel "Second letter" does not contain just "b" standalone but label "Beta" contains "b"
    expect(screen.getByText('Beta')).toBeDefined();
  });

  it('filters options by sublabel', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'second');
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('shows "No matches" when search yields no results', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'zzzzz');
    expect(screen.getByText('No matches')).toBeDefined();
  });

  it('resets search when dropdown closes and reopens', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    // Open and type a filter
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'alp');
    // Select an option to close
    await user.click(screen.getByText('Alpha'));
    // Reopen
    await user.click(screen.getByRole('button'));
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('');
    // All options should be visible again
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} disabled />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('renders disabled button with correct attributes', () => {
    render(<SearchableSelect value="" onChange={() => {}} options={options} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows create new button when onCreateNew is provided', async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();
    render(<SearchableSelect value="" onChange={() => {}} options={options} onCreateNew={onCreateNew} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('+ Create New')).toBeDefined();
  });

  it('calls onCreateNew and closes dropdown', async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();
    render(<SearchableSelect value="" onChange={() => {}} options={options} onCreateNew={onCreateNew} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('+ Create New'));
    expect(onCreateNew).toHaveBeenCalledOnce();
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('uses custom createNewLabel', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} onCreateNew={() => {}} createNewLabel="+ Add Item" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('+ Add Item')).toBeDefined();
  });

  it('does not show create new button when onCreateNew is not provided', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('+ Create New')).toBeNull();
  });

  it('highlights the currently selected option', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="b" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    // The dropdown is portalled; find Beta inside the dropdown list (not the trigger)
    const allBeta = screen.getAllByText('Beta');
    // The dropdown option button (not the trigger button)
    const dropdownBeta = allBeta.find((el) => el.closest('.max-h-60'))!;
    const betaBtn = dropdownBeta.closest('button')!;
    expect(betaBtn.className).toContain('text-primary');
  });

  it('closes on outside mousedown', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SearchableSelect value="" onChange={() => {}} options={options} />
        <div data-testid="outside">Outside</div>
      </div>
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
    // Click outside
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('closes on scroll outside the dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
    // Scroll outside
    await act(async () => {
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('does not close on scroll inside the dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('Search…');
    const dropdownEl = searchInput.closest('.fixed') as HTMLElement;
    // Scroll inside dropdown
    await act(async () => {
      dropdownEl.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    // Should still be open
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
  });

  it('closes when DropdownBackdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
    // Find the backdrop (fixed inset-0 element)
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('returns all options when search is empty or whitespace', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), '   ');
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.getByText('Gamma')).toBeDefined();
  });

  it('renders label when provided', () => {
    render(<SearchableSelect value="" onChange={() => {}} options={options} label="My Label" />);
    expect(screen.getByText('My Label')).toBeDefined();
  });

  it('does not render label when not provided', () => {
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    expect(screen.queryByText('My Label')).toBeNull();
  });

  it('positions dropdown below the trigger button', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={options} />);
    // Mock getBoundingClientRect
    const trigger = screen.getByRole('button');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 130, left: 50, right: 250, width: 200, height: 30,
      x: 50, y: 100, toJSON: () => {},
    });
    await user.click(trigger);
    const dropdown = screen.getByPlaceholderText('Search…').closest('.fixed') as HTMLElement;
    expect(dropdown.style.top).toBe('134px');
    expect(dropdown.style.left).toBe('50px');
  });
});
