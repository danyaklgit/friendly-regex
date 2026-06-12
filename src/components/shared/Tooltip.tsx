import { useEffect, useRef, useState, cloneElement, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { getScrollingSnapshot } from '../../utils/scrollingSignal';

interface TooltipProps {
  /** Tooltip body. Pass a function for expensive content (diffs, rule
   *  descriptions, extraction previews) — it is only evaluated when the
   *  tooltip actually opens, never on mount. */
  content: ReactNode | (() => ReactNode);
  placement?: Placement;
  children: ReactElement<Record<string, unknown>>;
  offsetAmount?: number;
  delay?: number;
}

/**
 * Lazily-armed tooltip. Until the user first hovers (or focuses) the
 * trigger, this renders nothing but the child plus a cheap arming
 * handler — no floating-ui hooks at all. The virtualized Transactions
 * table mounts ~14 Tooltips per row; running five floating-ui hooks
 * for each on row mount is what made fast scrolling blank out the
 * viewport. Arming on first interaction means rows pay zero tooltip
 * cost at mount, and only the handful of cells the user actually
 * hovers ever mount the floating machinery.
 *
 * The overlay mounts as a SIBLING of the child (bound to the DOM node
 * via `e.currentTarget`) rather than wrapping it, so arming never
 * remounts the trigger element — the pointer stays "inside" the same
 * DOM node and the browser's hover state carries over seamlessly.
 *
 * The global scrolling signal gates arming: while the table is
 * mid-scroll, rows slide under a stationary cursor and fire mouseenter
 * with no user intent. Arming on those would re-introduce the mass
 * floating-ui mounts this design removes, so those events are ignored
 * (checked at event time — no subscription, so scroll start/stop does
 * not re-render tooltips).
 */
export function Tooltip(props: TooltipProps) {
  const [referenceEl, setReferenceEl] = useState<HTMLElement | null>(null);
  const childProps = props.children.props;
  const arm = (el: HTMLElement) => {
    if (!getScrollingSnapshot()) setReferenceEl(el);
  };
  return (
    <>
      {cloneElement(props.children, {
        onMouseEnter: (e: MouseEvent<HTMLElement>) => {
          (childProps.onMouseEnter as ((ev: MouseEvent<HTMLElement>) => void) | undefined)?.(e);
          arm(e.currentTarget);
        },
        onFocus: (e: FocusEvent<HTMLElement>) => {
          (childProps.onFocus as ((ev: FocusEvent<HTMLElement>) => void) | undefined)?.(e);
          arm(e.currentTarget);
        },
      })}
      {referenceEl !== null && <TooltipOverlay {...props} referenceEl={referenceEl} />}
    </>
  );
}

function TooltipOverlay({
  content,
  placement = 'top',
  offsetAmount = 6,
  delay = 200,
  referenceEl,
}: TooltipProps & { referenceEl: HTMLElement }) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(offsetAmount), flip(), shift({ padding: 5 })],
    // External reference: the trigger element is rendered by Tooltip
    // above, not cloned here. useHover attaches its listeners straight
    // to this DOM node, so no reference props need to be applied.
    elements: { reference: referenceEl },
  });

  const hover = useHover(context, { move: false, delay: { open: delay } });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getFloatingProps } = useInteractions([hover, dismiss, role]);

  // This overlay only mounts because the pointer just entered (or focus
  // just landed on) the trigger — useHover's listeners attach after that
  // event already fired, so replay it: open after the normal hover delay
  // unless the pointer leaves first. The DOM leave/blur listeners also
  // force-close: useHover only auto-closes opens caused by hover events
  // it saw, and a timer-open has no openEvent, so without the explicit
  // close the tooltip would stick after unhover. The floating element is
  // pointer-events-none, so leaving the trigger always means close.
  // Focus open/close uses DOM listeners too (useFocus is reference-
  // props-based, and there are no reference props in this design).
  const mountOpenTimer = useRef<number | null>(null);
  useEffect(() => {
    mountOpenTimer.current = window.setTimeout(() => setIsOpen(true), delay);
    const cancelTimer = () => {
      if (mountOpenTimer.current !== null) {
        window.clearTimeout(mountOpenTimer.current);
        mountOpenTimer.current = null;
      }
    };
    const close = () => {
      cancelTimer();
      setIsOpen(false);
    };
    const open = () => setIsOpen(true);
    referenceEl.addEventListener('mouseleave', close);
    referenceEl.addEventListener('blur', close);
    referenceEl.addEventListener('focus', open);
    return () => {
      cancelTimer();
      referenceEl.removeEventListener('mouseleave', close);
      referenceEl.removeEventListener('blur', close);
      referenceEl.removeEventListener('focus', open);
    };
  }, [delay, referenceEl]);

  // useRole can't decorate the trigger (no reference props), so mirror
  // its aria-describedby link manually while open.
  useEffect(() => {
    if (!isOpen) return;
    const id = context.floatingId;
    if (!id) return;
    referenceEl.setAttribute('aria-describedby', id);
    return () => referenceEl.removeAttribute('aria-describedby');
  }, [isOpen, referenceEl, context.floatingId]);

  if (!isOpen) return null;
  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className="z-9999 px-2 py-1 text-[11px] font-medium text-gray-900 bg-white border border-primary/50 dark:text-gray-100 dark:bg-gray-800 dark:border-primary/60 rounded shadow-[0_4px_16px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.4),0_2px_6px_-1px_rgba(0,0,0,0.3)] pointer-events-none"
      >
        {typeof content === 'function' ? content() : content}
      </div>
    </FloatingPortal>
  );
}
