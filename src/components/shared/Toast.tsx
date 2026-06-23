import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
  /** When true, the toast never auto-dismisses (used for long-running progress
   *  toasts that update their message in place). Note: passing duration={Infinity}
   *  is unsafe because setTimeout coerces it to ~0, so use this flag instead. */
  persistent?: boolean;
  /** Tailwind z-index class. Override when the toast needs to sit above a
   *  high-z modal (e.g. the full-screen View Context modal at z-[10000]). */
  zClass?: string;
}

export function Toast({ message, type = 'success', onClose, duration = 3000, persistent = false, zClass = 'z-50' }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));
    if (persistent) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration, persistent]);

  const bg =
    type === 'success'
      ? 'bg-green-600'
      : type === 'error'
        ? 'bg-red-600'
        : 'bg-primary';

  return (
    <div
      className={`fixed bottom-4 right-4 ${zClass} ${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {type === 'success' && (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {type === 'error' && (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {type === 'info' && (
        <svg className="w-5 h-5 flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
