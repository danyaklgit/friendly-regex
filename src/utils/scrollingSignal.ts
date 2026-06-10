/**
 * Module-level "is the transactions table currently scrolling" signal.
 *
 * Purpose: surface a single boolean that any component can subscribe to
 * via `useSyncExternalStore` so it can render a cheaper variant while
 * the heavy virtualized table is in motion. Specifically, `Tooltip`
 * subscribes and short-circuits to a plain child clone during scroll —
 * a Show All on 44k rows mounts ~14 Tooltips per row, and the
 * cumulative floating-ui hook initialization cost on every newly-
 * mounted row is what produces the "blank viewport until scroll
 * stops" symptom.
 *
 * Why module-level (no Provider): the flag is genuinely global —
 * exactly one virtualized table is scrolling at any moment, and every
 * Tooltip everywhere benefits from the same signal. Threading a
 * context Provider through the app would add prop drilling for zero
 * additional capability. The cost is one Set of subscriber callbacks
 * and a tiny notify loop; `useSyncExternalStore` handles tearing.
 *
 * Update cadence: tanstack-virtual's `isScrolling` debounces by
 * `scrollEndTimeout` (defaults to ~150ms after the last scroll event),
 * so the flip happens at most twice per scroll gesture — once when
 * the gesture starts, once when it settles. Subscribers re-render at
 * those two moments, never on every scroll frame.
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
