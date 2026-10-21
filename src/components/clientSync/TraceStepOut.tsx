import { useState } from 'react';
import type { ClientSyncCall, ClientSyncOutCall, ClientSyncTraceOut, OutStatus } from '../../api/clientSync';
import { sortCallsOldestFirst, outOperationLabel } from '../../utils/clientSync/calls';
import { formatLocalTime, prettyJson } from '../../utils/clientSync/format';
import { Button } from '../shared/Button';
import { SegmentedControl } from '../shared/SegmentedControl';
import { VirtualizedCodeBlock } from '../shared/VirtualizedCodeBlock';
import { TagBadge } from '../transactions/TagBadge';
import { TraceStep } from './TraceStep';
import { CallRow, type FilePane } from './CallRow';
import { KvList } from './KvList';
import { HoldsNowGrouped } from './HoldsNowGrouped';
import { OutStatusBadge } from './StatusBadges';

interface TraceStepOutProps {
  data: ClientSyncTraceOut;
  /** The row's outbound status (Transaction.Out.Status), shown in the step header. */
  outStatus: OutStatus;
  withDate: boolean;
  onOpenFile: (call: ClientSyncCall, pane: FilePane) => void;
}

type OutPane = 'row' | 'response';
const PANE_OPTIONS = [
  { value: 'row' as const, label: 'This row' },
  { value: 'response' as const, label: 'Response' },
];

type HoldsView = 'grouped' | 'sent';
const HOLDS_OPTIONS = [
  { value: 'grouped' as const, label: 'Grouped' },
  { value: 'sent' as const, label: 'As sent' },
];

function OutCallBody({ call, onOpenFile }: { call: ClientSyncOutCall; onOpenFile: (call: ClientSyncCall, pane: FilePane) => void }) {
  const [pane, setPane] = useState<OutPane>('row');
  const text = pane === 'row' ? call.ElementJson : call.ResponseText;
  const hasFile = pane === 'row' ? call.HasRequestFile : call.HasResponseFile;
  const filePane: FilePane = pane === 'row' ? 'request' : 'response';
  return (
    <div className="space-y-2">
      <SegmentedControl label="Call view" options={PANE_OPTIONS} value={pane} onChange={setPane} />
      {text !== null ? (
        <VirtualizedCodeBlock text={prettyJson(text)} className="max-h-48" />
      ) : hasFile ? (
        <Button variant="outline" size="xs" onClick={() => onOpenFile(call, filePane)}>
          {pane === 'row' ? 'Open the full request' : 'Open the full response'}
        </Button>
      ) : (
        <p className="text-xs text-muted">{pane === 'row' ? 'Row payload not recorded.' : 'Response not recorded.'}</p>
      )}
    </div>
  );
}

/**
 * Step 4 of the trace: every outbound call oldest first, then what BwaTech
 * holds now, grouped by meaning (default) or as the flat list it was sent as.
 * A backend without the grouped view (CurrentView absent) offers the flat list only.
 */
export function TraceStepOut({ data, outStatus, withDate, onOpenFile }: TraceStepOutProps) {
  const [holdsView, setHoldsView] = useState<HoldsView>('grouped');
  const calls = sortCallsOldestFirst(data.Calls);
  const first = calls[0];
  const view = data.CurrentView;
  return (
    <TraceStep
      number={4}
      title="Sent to BwaTech"
      badge={<OutStatusBadge status={outStatus} />}
      time={first ? formatLocalTime(first.CallStartUtc, withDate) : undefined}
    >
      {calls.length === 0 && <p className="text-xs text-muted">No outbound call recorded for this transaction.</p>}
      {calls.map((call) => (
        <CallRow key={call.LogId} call={call} label={outOperationLabel(call.Endpoint, call.Operation)} withDate={withDate} onOpenFile={onOpenFile}>
          <OutCallBody call={call} onOpenFile={onOpenFile} />
        </CallRow>
      ))}
      <div aria-label="What BwaTech holds now" className="space-y-2 rounded-lg border border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">What BwaTech holds now</div>
          {view !== null && (
            <div className="ml-auto">
              <SegmentedControl label="Holds view" options={HOLDS_OPTIONS} value={holdsView} onChange={setHoldsView} />
            </div>
          )}
        </div>
        {data.DeletedAtBwatech && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-rose-400/40 dark:bg-red-900/20 dark:text-rose-200">
            Deleted at BwaTech (patch action 2)
          </p>
        )}
        {data.CurrentTag ? <TagBadge tag={data.CurrentTag} /> : <p className="text-xs text-muted">No tag held.</p>}
        {view !== null && holdsView === 'grouped' ? (
          <HoldsNowGrouped view={view} />
        ) : (
          <KvList
            label="Current attributes"
            items={data.CurrentAttributes.map((a) => ({ key: a.Key, value: a.Value }))}
            highlightKey={(key) => key.startsWith('kb_')}
            emptyLabel="No attributes held"
          />
        )}
      </div>
    </TraceStep>
  );
}
