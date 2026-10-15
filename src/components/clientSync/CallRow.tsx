import type { ReactNode } from 'react';
import type { ClientSyncCall } from '../../api/clientSync';
import { Button } from '../shared/Button';
import { CallBadge } from './StatusBadges';
import { formatLocalTime, formatDurationMs, DASH } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';

export type FilePane = 'request' | 'response';

interface CallRowProps {
  call: ClientSyncCall;
  /** Extra label after the endpoint ("the delivery", "insert", "update"). */
  label?: string;
  withDate: boolean;
  onOpenFile: (call: ClientSyncCall, pane: FilePane) => void;
  /** both: Full request / Response per file flag. whole: one "Whole call" button. none: no buttons. */
  fileButtons?: 'both' | 'whole' | 'none';
  /** Per-call body (tabs) under the line. */
  children?: ReactNode;
}

/** One call line of the trace drawer: time, endpoint, counts, status, duration, and the viewer buttons. */
export function CallRow({ call, label, withDate, onOpenFile, fileButtons = 'both', children }: CallRowProps) {
  const anyFile = call.HasRequestFile || call.HasResponseFile;
  return (
    <div role="group" aria-label={`Call ${call.LogId}`} className="rounded-lg border border-border bg-surface-secondary/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-body-secondary">{formatLocalTime(call.CallStartUtc, withDate) || DASH}</span>
        <span className="font-medium text-heading">{call.Endpoint || DASH}</span>
        {label && <span className="text-muted">{label}</span>}
        {call.RecordCount !== null && <span className="text-muted">{`${formatCount(call.RecordCount)} txns`}</span>}
        <CallBadge call={call} />
        {call.DurationMs !== null && <span className="text-muted">{formatDurationMs(call.DurationMs)}</span>}
        {call.RerunOfId && <span className="text-muted">{`rerun of ${call.RerunOfId}`}</span>}
        <span className="ml-auto inline-flex gap-1">
          {fileButtons === 'both' && call.HasRequestFile && (
            <Button variant="ghost" size="xs" onClick={() => onOpenFile(call, 'request')}>Full request</Button>
          )}
          {fileButtons === 'both' && call.HasResponseFile && (
            <Button variant="ghost" size="xs" onClick={() => onOpenFile(call, 'response')}>Response</Button>
          )}
          {fileButtons === 'whole' && anyFile && (
            <Button variant="ghost" size="xs" onClick={() => onOpenFile(call, 'request')}>Whole call</Button>
          )}
        </span>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
