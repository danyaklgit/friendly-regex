import { useState, type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';

interface MoreTagsPopoverProps {
  hiddenCount: number;
  children: ReactNode;
}

/**
 * Overflow control for the Tags cell: a "+N" pill that, on click, opens a
 * popover listing the tags that did not fit. Floating-ui is mounted LAZILY
 * (only after the first click) so the thousands of cells that never overflow
 * pay zero floating cost at mount — mirroring the Tooltip arming pattern. The
 * popover is interactive (pointer-events enabled) so the hidden TagBadges keep
 * their click-to-filter behavior.
 */
export function MoreTagsPopover({ hiddenCount, children }: MoreTagsPopoverProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor((prev) => (prev ? null : e.currentTarget));
        }}
        className="shrink-0 rounded-md border border-border bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium text-body-secondary hover:bg-surface-hover hover:text-body transition-colors"
        aria-label={`Show ${hiddenCount} more ${hiddenCount === 1 ? 'tag' : 'tags'}`}
      >
        +{hiddenCount}
      </button>
      {anchor && <MoreTagsOverlay anchor={anchor} onClose={() => setAnchor(null)}>{children}</MoreTagsOverlay>}
    </>
  );
}

function MoreTagsOverlay({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
}) {
  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => { if (!open) onClose(); },
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    elements: { reference: anchor },
  });
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className="z-[9999] flex max-w-xs flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-elevated p-2 shadow-xl"
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
