import { createPortal } from 'react-dom';

interface DropdownBackdropProps {
  onClick?: () => void;
}

export function DropdownBackdrop({ onClick }: DropdownBackdropProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[0px]"
      onClick={onClick}
      aria-hidden
    />,
    document.body
  );
}
