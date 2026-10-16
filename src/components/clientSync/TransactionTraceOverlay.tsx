import type { TepHeaders } from '../../api/transactions';
import { useClientSyncTrace } from '../../hooks/useClientSync';
import { TraceDrawer } from './TraceDrawer';

interface TransactionTraceOverlayProps {
  transactionId: string;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  onClose: () => void;
}

/**
 * The Client Sync trace drawer for any engine transaction, opened from the
 * Transactions grid's right-click menu. GetClientSyncTrace accepts any id, so
 * non-VIP rows render KB "not eligible" and Ledger rows Out "never" as in the
 * tab. Dates always show: a grid row can be from any day.
 */
export function TransactionTraceOverlay({ transactionId, authToken, tepHeaders, onClose }: TransactionTraceOverlayProps) {
  const trace = useClientSyncTrace(transactionId, authToken, tepHeaders);
  return (
    <TraceDrawer
      transactionId={transactionId}
      trace={trace.report}
      loading={trace.loading}
      error={trace.error}
      onRetry={trace.refetch}
      onClose={onClose}
      withDate
    />
  );
}
