import { useEffect, useRef, type RefObject } from 'react';

/**
 * Smoothly scrolls the LAST child of `containerRef` into view whenever `count`
 * grows — i.e. a new item was appended to a list. Used by the rule builder so
 * a freshly added condition / rule set / attribute is brought into view (and
 * kept visible) the moment the operator clicks "+ Add…", instead of appearing
 * off-screen below the fold.
 *
 * Relies on the new item being the container's last DOM child (all the rule
 * builder lists append). `scrollIntoView` walks up to the nearest scrollable
 * ancestor, so it works whether the page or an inner panel owns the scroll.
 * `block: 'nearest'` keeps the jump minimal (no jarring re-centering), and a
 * temporary `scroll-margin-bottom` overscrolls a bit further so the "+ Add…"
 * button that sits just below the new item stays visible too.
 */
export function useScrollNewItemIntoView(
  count: number,
  containerRef: RefObject<HTMLElement | null>,
  /** Extra space kept below the new item so the trailing "+ Add…" button
   *  (and a little breathing room) ends up on screen. */
  revealBelow = '5rem',
): void {
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      const el = containerRef.current?.lastElementChild as HTMLElement | null;
      if (el) {
        el.style.scrollMarginBottom = revealBelow;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    prevCount.current = count;
  }, [count, containerRef, revealBelow]);
}
