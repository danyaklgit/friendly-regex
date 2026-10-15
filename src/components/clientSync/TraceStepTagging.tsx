import { useState } from 'react';
import type { ClientSyncTraceTagging } from '../../api/clientSync';
import { tagCertainty } from '../../utils/clientSync/status';
import { Badge } from '../shared/Badge';
import { SegmentedControl } from '../shared/SegmentedControl';
import { TagBadge } from '../transactions/TagBadge';
import { TraceStep } from './TraceStep';
import { KvList } from './KvList';

interface TraceStepTaggingProps {
  data: ClientSyncTraceTagging;
}

type TagLayer = 'published' | 'operator';
const LAYER_OPTIONS = [
  { value: 'published' as const, label: 'Published' },
  { value: 'operator' as const, label: 'Operator' },
];

/** Step 2 of the trace: the published tag state by default, the operator state behind a toggle when the layers differ. */
export function TraceStepTagging({ data }: TraceStepTaggingProps) {
  const [layer, setLayer] = useState<TagLayer>('published');
  // The Operator view only exists while the layers differ; fall back to Published once they agree.
  const effective: TagLayer = data.LayersDiffer ? layer : 'published';
  const state = effective === 'operator' ? data.Operator : data.Published;
  const libraryLine = state.LibraryVersion !== null || state.LibraryStatus
    ? `library${state.LibraryVersion !== null ? ` v${state.LibraryVersion}` : ''}${state.LibraryStatus ? ` ${state.LibraryStatus}` : ''}`
    : null;
  return (
    <TraceStep
      number={2}
      title="Tagged by TEP"
      badge={state.IsUntagged ? <Badge variant="danger" size="xs">Untagged</Badge> : <Badge variant="success" size="xs">Tagged</Badge>}
    >
      {data.LayersDiffer && (
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Tag layer" options={LAYER_OPTIONS} value={layer} onChange={setLayer} />
          <span className="text-xs text-amber-700 dark:text-amber-300">Operator tag not released yet</span>
        </div>
      )}
      {state.IsUntagged ? (
        <p className="text-xs text-muted">{`No rule matched this transaction${state.IsDeadEnd ? ' (marked dead end)' : ''}.`}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <TagBadge tag={state.Tag} certainty={tagCertainty(state.CertaintyLevel)} nickname={state.Nickname ?? undefined} />
            {state.IsDeadEnd && <Badge variant="gray" size="xs">Dead end</Badge>}
            {state.IsMultiTag && state.OtherTags.map((tag) => <Badge key={tag} variant="default" size="xs">{tag}</Badge>)}
            {libraryLine && <span className="text-[11px] text-muted">{libraryLine}</span>}
          </div>
          <KvList
            label="Attributes"
            items={state.Attributes.map((a) => ({ key: a.Key, value: a.Value, isMandatory: a.IsMandatory, isValid: a.IsValid }))}
            emptyLabel="No attributes extracted"
          />
        </>
      )}
    </TraceStep>
  );
}
