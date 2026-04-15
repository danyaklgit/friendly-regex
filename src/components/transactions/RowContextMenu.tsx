import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface RowContextMenuProps {
  x: number;
  y: number;
  onViewContext: () => void;
  onClose: () => void;
}

export function RowContextMenu({ x, y, onViewContext, onClose }: RowContextMenuProps) {
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
    </div>,
    document.body,
  );
}
