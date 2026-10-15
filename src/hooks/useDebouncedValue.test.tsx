import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts with the value and only follows changes after the delay, restarting on each change', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), { initialProps: { v: '' } });
    expect(result.current).toBe('');
    rerender({ v: 'F' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('');
    rerender({ v: 'FT' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('FT');
  });
});
