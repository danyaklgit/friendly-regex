import { Button } from '../shared/Button';

interface CheckoutBannerProps {
  bank: string;
  side: string;
  hasChanges: boolean;
  onRelease: (bank: string, side: string) => void;
  onCheckin: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
}

export function CheckoutBanner({ bank, side, hasChanges, onRelease, onCheckin, onRequestUndo }: CheckoutBannerProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 mb-3 rounded-lg flex-col md:flex-row gap-4">
      <span className="text-sm text-primary-dark">
        <span className="font-semibold">You're working on</span> Bank {bank}, Side {side}
      </span>
      <div className='flex gap-3'>
        {onRequestUndo && hasChanges && (
          <Button variant="secondary" size="xs" onClick={() => onRequestUndo(bank, side)}>
            Review Changes
          </Button>
        )}
        <Button variant="primary" size="xs" onClick={() => onRelease(bank, side)}>
          {hasChanges ? 'Save and Release' : 'Release'}
        </Button>
        <Button variant="primary" size="xs" onClick={() => onCheckin(bank, side)}>
          {hasChanges ? 'Save and Check In' : 'Check In'}
        </Button>

      </div>
    </div>
  );
}
