import type { ClientSyncCall, ClientSyncTraceIn } from '../../api/clientSync';
import { sortCallsOldestFirst, firstAcceptedDelivery } from '../../utils/clientSync/calls';
import { formatLocalTime, prettyJson } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';
import { Badge } from '../shared/Badge';
import { VirtualizedCodeBlock } from '../shared/VirtualizedCodeBlock';
import { TraceStep } from './TraceStep';
import { CallRow, type FilePane } from './CallRow';
import { CallBadge } from './StatusBadges';

interface TraceStepInProps {
  data: ClientSyncTraceIn;
  withDate: boolean;
  onOpenFile: (call: ClientSyncCall, pane: FilePane) => void;
}

const LATE_ARRIVAL_NOTE = 'Arrived after the confirmed statement: stored archived. A live late arrival is still pushed to BwaTech (see step 4); only a replayed delivery is never sent.';

/** Step 1 of the trace: deliveries oldest first, the item as received, raw-file meta, late-arrival note. */
export function TraceStepIn({ data, withDate, onOpenFile }: TraceStepInProps) {
  const deliveries = sortCallsOldestFirst(data.Deliveries);
  const accepted = firstAcceptedDelivery(data.Deliveries);
  const first = deliveries[0];
  const hasMeta = data.RawFileName !== null || data.RawCreatedUtc !== null || data.RawProcessedUtc !== null || data.RawStoredTransactionCount !== null;
  return (
    <TraceStep
      number={1}
      title="Received from BwaTech"
      badge={first ? <CallBadge call={first} /> : <Badge variant="gray" size="xs">No delivery</Badge>}
      time={first ? formatLocalTime(first.CallStartUtc, withDate) : undefined}
    >
      {deliveries.length === 0 && <p className="text-xs text-muted">No delivery recorded for this transaction.</p>}
      {deliveries.map((call) => (
        <CallRow
          key={call.LogId}
          call={call}
          label={accepted !== null && call.LogId === accepted.LogId ? 'the delivery' : undefined}
          withDate={withDate}
          onOpenFile={onOpenFile}
        />
      ))}
      {data.LateArrival && (
        <p className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-900/20 dark:text-cyan-100">
          {LATE_ARRIVAL_NOTE}
        </p>
      )}
      {hasMeta && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {data.RawFileName !== null && <><dt>Raw file</dt><dd className="font-mono text-body-secondary break-all">{data.RawFileName}</dd></>}
          {data.RawCreatedUtc !== null && <><dt>Created</dt><dd>{formatLocalTime(data.RawCreatedUtc, withDate)}</dd></>}
          {data.RawProcessedUtc !== null && <><dt>Processed</dt><dd>{formatLocalTime(data.RawProcessedUtc, withDate)}</dd></>}
          {data.RawStoredTransactionCount !== null && <><dt>Stored</dt><dd>{`${formatCount(data.RawStoredTransactionCount)} transactions`}</dd></>}
        </dl>
      )}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
          {`This transaction${data.ItemFormat ? ` (${data.ItemFormat})` : ''}`}
        </div>
        {data.ItemText ? (
          <VirtualizedCodeBlock text={prettyJson(data.ItemText)} className="max-h-64" />
        ) : (
          <p className="text-xs text-muted">Item text not available.</p>
        )}
      </div>
    </TraceStep>
  );
}
