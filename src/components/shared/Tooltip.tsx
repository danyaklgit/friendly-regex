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
}

export function Tooltip({ content, placement = 'top', children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 5 })],
  });

  const hover = useHover(context, { move: false, delay: { open: 200 } });
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
            className="z-[9999] px-2 py-1 text-[11px] font-medium text-white bg-gray-900 rounded shadow-lg pointer-events-none"
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
