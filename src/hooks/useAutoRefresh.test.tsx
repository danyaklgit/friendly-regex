import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoRefresh } from './useAutoRefresh';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('ticks every interval while enabled and visible, and not at all when disabled', () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useAutoRefresh({ enabled, intervalMs: 30000, onTick }), { initialProps: { enabled: true } });
    act(() => { vi.advanceTimersByTime(29999); });
    expect(onTick).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onTick).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(onTick).toHaveBeenCalledTimes(3);
    rerender({ enabled: false });
    act(() => { vi.advanceTimersByTime(120000); });
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('stops while hidden, re-arms from zero when shown, and never bursts queued ticks', () => {
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh({ enabled: true, intervalMs: 30000, onTick }));
    act(() => { vi.advanceTimersByTime(20000); });
    act(() => { setVisibility('hidden'); });
    act(() => { vi.advanceTimersByTime(100000); });
    expect(onTick).not.toHaveBeenCalled();
    act(() => { setVisibility('visible'); });
    act(() => { vi.advanceTimersByTime(29999); });
    expect(onTick).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onTick and owns no caption clock (no re-render between ticks)', () => {
    const first = vi.fn();
    const second = vi.fn();
    let renders = 0;
    const { result, rerender } = renderHook(({ onTick }) => { renders += 1; return useAutoRefresh({ enabled: true, intervalMs: 30000, onTick }); }, { initialProps: { onTick: first } });
    expect(result.current).toBeUndefined();
    rerender({ onTick: second });
    const rendersBefore = renders;
    act(() => { vi.advanceTimersByTime(30000); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(renders).toBe(rendersBefore);
  });

  it('cleans up its timers on unmount', () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh({ enabled: true, intervalMs: 30000, onTick }));
    unmount();
    act(() => { vi.advanceTimersByTime(90000); });
    expect(onTick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
