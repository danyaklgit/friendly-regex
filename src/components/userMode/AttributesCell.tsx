import { useState } from 'react';
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
  safePolygon,
} from '@floating-ui/react';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { RedactedText } from './RedactedText';

const INLINE_LIMIT = 4;

interface AttributesCellProps {
  /** Display key/value pairs. Caller should pre-filter nulls, resolve coded
   *  values (e.g. beneficiary bank code → name), and order them as desired. */
  attributes: Record<string, string>;
}

/**
 * One-row attribute display for the user-mode table. Up to four key/value rows
 * render inline; any additional pairs collapse into the hover popover.
 *
 * Values render through `RedactedText`, so the redaction toggle masks demoed
 * personal data (beneficiary names, account numbers, IBANs) as black censor
 * bars alongside the Description column.
 *
 * The popover is always available when the cell has at least one attribute —
 * even for a single chip — so users can read full (un-truncated) values
 * regardless of how many attributes the row carries.
 */
export function AttributesCell({ attributes }: AttributesCellProps) {
  const entries = Object.entries(attributes);

  if (entries.length === 0) {
    return <span className="text-xs text-faint italic">No attributes</span>;
  }

  return <AttributesWithPopover entries={entries} />;
}

function AttributesWithPopover({ entries }: { entries: [string, string][] }) {
  const visible = entries.slice(0, INLINE_LIMIT);
  const overflow = entries.length - INLINE_LIMIT;

  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  // safePolygon lets the user travel from the trigger to the popover without
  // closing — the path between them stays "live".
  const hover = useHover(context, { handleClose: safePolygon() });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <>
      <div
        ref={refs.setReference}
        tabIndex={0}
        className="flex flex-col gap-1 rounded outline-none focus-visible:ring-1 focus-visible:ring-primary"
        {...getReferenceProps()}
      >
        <ul className="space-y-0.5">
          {visible.map(([k, v]) => (
            <li
              key={k}
              className="flex items-baseline gap-1 text-xs whitespace-nowrap min-w-0"
            >
              <span className="font-medium text-primary-dark/80 dark:text-primary-light/80 shrink-0">{humanizeFieldName(k)}:</span>
              <span className="truncate text-primary-dark dark:text-primary-light"><RedactedText text={v} /></span>
            </li>
          ))}
        </ul>
        {overflow > 0 && (
          <span className="text-[11px] text-primary hover:underline">+{overflow} more</span>
        )}
      </div>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[9999] rounded-md border border-border bg-surface-elevated p-3 shadow-lg overflow-x-auto max-w-[90vw]"
          >
            <ul className="space-y-1">
              {entries.map(([k, v]) => (
                <li key={k} className="flex items-baseline gap-2 text-xs whitespace-nowrap">
                  <span className="font-medium text-primary-dark/80 dark:text-primary-light/80 shrink-0">{humanizeFieldName(k)}:</span>
                  <span className="text-primary-dark dark:text-primary-light"><RedactedText text={v} /></span>
                </li>
              ))}
            </ul>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
