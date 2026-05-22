import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  fullHeight?: boolean;
  /** Optional content rendered in the modal header next to the close button.
   *  Used for inline header actions such as the comment search trigger. */
  headerAction?: ReactNode;
  /** Override the default z-index class (default: "z-50"). Use e.g. "z-[10000]" to appear above other overlays. */
  zClass?: string;
}

export function Modal({ open, onClose, title, children, footer, fullHeight, headerAction, zClass = 'z-50' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zClass} flex items-start justify-center pt-8 px-4`}>
      <div className="fixed inset-0 bg-black/10 dark:bg-black/40" onClick={onClose} />
      <div className={`relative bg-surface-elevated rounded-xl shadow-2xl w-full max-w-3xl ${fullHeight ? 'h-[90vh]' : 'max-h-[90vh]'} flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
          <div className="flex items-center gap-3">
            {headerAction}
            <button
              onClick={onClose}
              className="text-faint hover:text-body-secondary transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
