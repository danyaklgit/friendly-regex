/**
 * Module-level "is the transactions table currently scrolling" signal.
 *
 * Purpose: let `Tooltip` distinguish a real hover from rows sliding
 * under a stationary cursor mid-scroll. Tooltips arm their floating-ui
 * machinery lazily on first mouseenter/focus; arming on scroll-induced
 * mouseenter events would mount floating-ui for every cell that passes
 * under the pointer during a fast scroll, which is exactly the mass
 * mount cost the lazy design removes. `Tooltip` reads the snapshot at
 * event time (`getScrollingSnapshot`) — it does NOT subscribe, so the
 * signal flipping never re-renders anything. `subscribeScrolling` is
 * kept for any future subscriber that wants `useSyncExternalStore`
 * semantics.
 *
 * Why module-level (no Provider): the flag is genuinely global —
 * exactly one virtualized table is scrolling at any moment, and every
 * Tooltip everywhere benefits from the same signal. Threading a
 * context Provider through the app would add prop drilling for zero
 * additional capability.
 *
 * Update cadence: tanstack-virtual's `isScrolling` debounces by
 * `scrollEndTimeout` (defaults to ~150ms after the last scroll event),
 * so the flip happens at most twice per scroll gesture — once when
 * the gesture starts, once when it settles.
 */

const listeners = new Set<() => void>();
let scrolling = false;

export function setScrolling(value: boolean): void {
  if (scrolling === value) return;
  scrolling = value;
  // Snapshot the listener set before iterating: a subscriber may
  // synchronously unsubscribe during its own callback (React's
  // useSyncExternalStore can do this when components unmount in
  // response to the flip), which would otherwise mutate the set
  // mid-iteration and skip remaining listeners.
  const snapshot = Array.from(listeners);
  for (const fn of snapshot) fn();
}

export function subscribeScrolling(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getScrollingSnapshot(): boolean {
  return scrolling;
}
