import { useState } from 'react';
import type { ClientSyncCall, ClientSyncKbCall, ClientSyncTraceKb } from '../../api/clientSync';
import { sortCallsOldestFirst } from '../../utils/clientSync/calls';
import { kbStatusDisplay } from '../../utils/clientSync/status';
import { formatLocalTime, prettyJson } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';
import { SegmentedControl } from '../shared/SegmentedControl';
import { VirtualizedCodeBlock } from '../shared/VirtualizedCodeBlock';
import { TraceStep } from './TraceStep';
import { CallRow, type FilePane } from './CallRow';
import { KvList } from './KvList';
import { KbStatusBadge, CertaintyPill, KbCustomerTypeChip } from './StatusBadges';

interface TraceStepKbProps {
  data: ClientSyncTraceKb;
  withDate: boolean;
  onOpenFile: (call: ClientSyncCall, pane: FilePane) => void;
}

const NOT_ELIGIBLE_NOTE = 'Not eligible for the knowledge base: only tagged credits with a payer are looked up.';
const PRE_RELEASE_NOTE = 'Call details not recorded for answers before 15 Oct 2026.';
const NOT_KNOWN_NOTE = 'The knowledge base did not know this payer';
const CALL_FAILED_NOTE = 'No response recorded: the call failed.';

type KbPane = 'request' | 'response';
const PANE_OPTIONS = [
  { value: 'request' as const, label: 'Request' },
  { value: 'response' as const, label: 'Response' },
];

function KbCallBody({ call }: { call: ClientSyncKbCall }) {
  const [pane, setPane] = useState<KbPane>('request');
  const text = pane === 'request' ? call.RequestRecordJson : call.ResponseRecordJson;
  return (
    <div className="space-y-2">
      <SegmentedControl label="Call view" options={PANE_OPTIONS} value={pane} onChange={setPane} />
      {text !== null ? (
        <VirtualizedCodeBlock text={prettyJson(text)} className="max-h-48" />
      ) : (
        <p className="text-xs text-muted">{pane === 'request' ? 'Request record not recorded.' : call.Succeeded ? NOT_KNOWN_NOTE : CALL_FAILED_NOTE}</p>
      )}
    </div>
  );
}

/** Step 3 of the trace: the published knowledge-base answer, the customer, and every call with its records. */
export function TraceStepKb({ data, withDate, onOpenFile }: TraceStepKbProps) {
  const pub = data.Published;
  const badge = <KbStatusBadge status={pub.Status} context="drawer" />;
  if (pub.Status === 'NotEligible') {
    return (
      <TraceStep number={3} title="Knowledge base" badge={badge}>
        <p className="text-xs text-muted">{NOT_ELIGIBLE_NOTE}</p>
      </TraceStep>
    );
  }
  const calls = sortCallsOldestFirst(data.Calls);
  const first = calls[0];
  const hasCustomer = pub.CustomerNameEn !== null || pub.CustomerCode !== null;
  return (
    <TraceStep
      number={3}
      title="Knowledge base"
      badge={<>{badge}<CertaintyPill certainty={pub.Certainty} rank={pub.CertaintyRank} /></>}
      time={first ? formatLocalTime(first.CallStartUtc, withDate) : undefined}
    >
      {data.Operator.Status !== pub.Status && (
        <p className="text-xs text-muted">{`Operator layer: ${kbStatusDisplay(data.Operator.Status, 'drawer').label}`}</p>
      )}
      {hasCustomer && (
        <div aria-label="Customer" className="rounded-lg border border-border bg-surface-secondary/60 px-3 py-2 text-xs">
          <div className="font-medium text-heading">{pub.CustomerNameEn ?? pub.CustomerCode}</div>
          {pub.CustomerNameAr && <div dir="rtl" className="text-body-secondary">{pub.CustomerNameAr}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <KbCustomerTypeChip type={pub.KbCustomerType} />
            {pub.CustomerLevel && <span>{pub.CustomerLevel}</span>}
            {pub.CustomerCode && <span className="font-mono">{pub.CustomerCode}</span>}
            {pub.CustomerType && <span>{pub.CustomerType}</span>}
            <span>{`${formatCount(pub.Alternatives)} alternative${pub.Alternatives === 1 ? '' : 's'}`}</span>
          </div>
        </div>
      )}
      {data.PublishedAttributes.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-body-secondary">{`Published attributes (${data.PublishedAttributes.length})`}</summary>
          <div className="mt-1">
            <KvList label="Published attributes" items={data.PublishedAttributes.map((a) => ({ key: a.Key, value: a.Value }))} />
          </div>
        </details>
      )}
      {calls.length === 0 ? (
        <p className="text-xs text-muted">{PRE_RELEASE_NOTE}</p>
      ) : (
        calls.map((call) => (
          <CallRow key={call.LogId} call={call} withDate={withDate} onOpenFile={onOpenFile} fileButtons="whole">
            <KbCallBody call={call} />
          </CallRow>
        ))
      )}
    </TraceStep>
  );
}
