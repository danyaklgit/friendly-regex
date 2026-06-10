import { useState, type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  type Placement,
} from '@floating-ui/react';

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  /** Render the item in destructive (red) styling. Use for irreversible actions. */
  danger?: boolean;
  /** Disable the item (still visible, not clickable). */
  disabled?: boolean;
  /** Optional leading icon (rendered to the left of the label). */
  icon?: ReactNode;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Disable the trigger button — menu cannot be opened. */
  disabled?: boolean;
  /** Accessible label for the trigger button (screen readers + a11y tests). */
  triggerLabel?: string;
  /** Native title attribute for hover-hint (e.g. tagging-lock explanation). */
  triggerTitle?: string;
  /** Floating-ui placement of the menu surface relative to the trigger. */
  placement?: Placement;
  /** Forwarded to the trigger button (e.g. onboarding `data-tour` markers). */
  'data-tour'?: string;
}

/**
 * Floating, accessible kebab menu anchored to its trigger. First consumer is
 * the Backlog row's Rollback action — moved here to add deliberate friction
 * (an extra click) before a destructive operation. Built on the same
 * @floating-ui/react primitives as [Tooltip](./Tooltip.tsx).
 *
 * Closes on item click, outside click, and Escape.
 */
export function OverflowMenu({
  items,
  disabled,
  triggerLabel = 'More actions',
  triggerTitle,
  placement = 'bottom-end',
  'data-tour': dataTour,
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={triggerLabel}
        title={triggerTitle}
        disabled={disabled}
        data-tour={dataTour}
        // Bordered trigger: matches the visual weight of the sibling
        // `variant="outline"` action buttons (Compare, Transactions) on
        // the Backlog row so the kebab doesn't read as a bare icon next
        // to them. The border thickens / fills slightly on hover and
        // the open-state keeps the active surface tone for context.
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border text-body-secondary transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed border-border' : 'border-border hover:text-heading hover:bg-surface-active hover:border-border-strong cursor-pointer'}
          ${isOpen ? 'bg-surface-active text-heading border-border-strong' : ''}`}
        {...getReferenceProps()}
      >
        {/* Horizontal ellipsis (meatballs). Inline SVG so we don't pull a new icon dep. */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>
      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-[9999] min-w-[180px] bg-surface-elevated border border-border rounded-md shadow-lg py-1 outline-none"
            >
              {items.map((item, idx) => {
                // Hover and keyboard-focus styling. `bg-surface-hover` was
                // too close to `bg-surface-elevated` (the menu surface) to
                // read as a state change in dark mode — operators couldn't
                // tell which item they were pointing at. `bg-surface-active`
                // is the next darker step and gives clear feedback. Danger
                // items keep their red-tinted hover but bump it up so it's
                // visible on the same elevated surface. `focus-visible`
                // mirrors hover so keyboard navigation through the menu
                // surfaces the same affordance.
                const dangerClass = item.danger
                  ? 'text-red-600 dark:text-rose-300 hover:bg-red-100 dark:hover:bg-red-900/40 focus-visible:bg-red-100 dark:focus-visible:bg-red-900/40'
                  : 'text-body hover:bg-surface-active hover:text-heading focus-visible:bg-surface-active focus-visible:text-heading';
                const disabledClass = item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
                return (
                  <button
                    key={`${item.label}-${idx}`}
                    role="menuitem"
                    type="button"
                    disabled={item.disabled}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left outline-none transition-colors ${dangerClass} ${disabledClass}`}
                    {...getItemProps({
                      onClick: () => {
                        if (item.disabled) return;
                        item.onClick();
                        setIsOpen(false);
                      },
                    })}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
