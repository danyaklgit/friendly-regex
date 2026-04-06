import { useState, cloneElement, type ReactElement, type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';

interface TooltipProps {
  content: ReactNode;
  placement?: Placement;
  children: ReactElement<Record<string, unknown>>;
  offsetAmount?: number;
  delay?: number;
}

export function Tooltip({ content, placement = 'top', children, offsetAmount = 6, delay = 200 }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(offsetAmount), flip(), shift({ padding: 5 })],
  });

  const hover = useHover(context, { move: false, delay: { open: delay } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      {cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(),
      })}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[9999] px-2 py-1 text-[11px] font-medium text-gray-900 bg-white border border-primary/50 dark:text-gray-100 dark:bg-gray-800 dark:border-primary/60 rounded shadow-[0_4px_16px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.4),0_2px_6px_-1px_rgba(0,0,0,0.3)] pointer-events-none"
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
