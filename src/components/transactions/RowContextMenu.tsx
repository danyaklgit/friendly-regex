import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface RowContextMenuProps {
  x: number;
  y: number;
  onViewContext: () => void;
  onComment?: () => void;
  /** Add the right-clicked cell to the open Rule Builder as a matching-rule
   *  condition. Present only when the builder is open and a data cell was
   *  clicked. `equals` → exact match; `contains` → substring match. */
  onAddMatchingRule?: (op: 'equals' | 'contains') => void;
  /** Short "Field: value" preview shown under the matching-rule items. */
  matchingRuleHint?: string;
  onClose: () => void;
}

export function RowContextMenu({ x, y, onViewContext, onComment, onAddMatchingRule, matchingRuleHint, onClose }: RowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handleScroll() { onClose(); }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
  };

  return createPortal(
    <div ref={ref} style={style} className="min-w-[160px] rounded-lg border border-border bg-surface-elevated shadow-lg py-1 animate-in fade-in duration-100">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-hover transition-colors cursor-pointer"
        onClick={onViewContext}
      >
        <svg className="w-4 h-4 text-body-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
        View Context
      </button>
      {onComment && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-hover transition-colors cursor-pointer"
          onClick={onComment}
        >
          <svg className="w-4 h-4 text-body-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          Comment
        </button>
      )}
      {onAddMatchingRule && (
        <>
          <div className="my-1 border-t border-border" />
          {matchingRuleHint && (
            <div className="px-3 pt-1 pb-0.5 text-[11px] text-faint truncate max-w-[220px]" title={matchingRuleHint}>
              {matchingRuleHint}
            </div>
          )}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-hover transition-colors cursor-pointer"
            onClick={() => onAddMatchingRule('equals')}
          >
            <span className="w-4 h-4 flex items-center justify-center text-body-secondary font-mono font-semibold">=</span>
            Add as matching rule (equals)
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-hover transition-colors cursor-pointer"
            onClick={() => onAddMatchingRule('contains')}
          >
            <span className="w-4 h-4 flex items-center justify-center text-body-secondary font-mono font-semibold text-[10px]">⊂</span>
            Add as matching rule (contains)
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
