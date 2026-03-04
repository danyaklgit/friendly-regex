import { Button } from '../shared/Button';

interface CheckoutBannerProps {
  bank: string;
  side: string;
  onRelease: (bank: string, side: string) => void;
  onCheckin: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
}

export function CheckoutBanner({ bank, side, onRelease, onCheckin, onRequestUndo }: CheckoutBannerProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 mb-3  rounded-lg relative flex-col md:flex-row md:fixed top-0 right-50 gap-4">
      <span className="text-sm text-primary-dark">
        <span className="font-semibold">You're working on</span> Bank {bank}, Side {side}
      </span>
      <div className='flex gap-3'>
        <Button disabled={true} variant="primary" size="xs" onClick={() => onRelease(bank, side)}>
          Release
        </Button>
        {onRequestUndo && (
          <Button variant="danger_ghost" size="xs" onClick={() => onRequestUndo(bank, side)}>
            Undo Changes
          </Button>
        )}
        <Button variant="primary" size="xs" onClick={() => onCheckin(bank, side)}>
          Check In
        </Button>
      </div>
    </div>
  );
}
