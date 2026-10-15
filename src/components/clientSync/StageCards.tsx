import { memo, type ReactNode } from 'react';
import type { ClientSyncSummary } from '../../api/clientSync';
import { Badge } from '../shared/Badge';
import { HealthBadge, CertaintyPill } from './StatusBadges';
import { inHealth, taggingHealth, kbHealth, outHealth, taggedPercent, feedChipLabel } from '../../utils/clientSync/status';
import { formatLocalTime, formatDurationMs, DASH } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';

interface StageCardsProps {
  summary: ClientSyncSummary;
  /** Prefix timestamps with their date (range spans several days). */
  withDate: boolean;
}

interface StageCardProps {
  number: number;
  title: string;
  big: string;
  unit: string;
  chips: ReactNode;
  footer: string;
  health: ReactNode;
  dimmed?: boolean;
  extra?: ReactNode;
}

function StageCard({ number, title, big, unit, chips, footer, health, dimmed, extra }: StageCardProps) {
  return (
    <section aria-label={title} className={`rounded-lg border border-border bg-surface px-4 py-3 flex flex-col gap-2 min-w-0 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{`${number} · ${title}`}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold text-heading leading-none">{big}</span>
            {unit && <span className="text-[11px] text-muted">{unit}</span>}
          </div>
        </div>
        {health}
      </div>
      <div className="flex flex-wrap gap-1 min-h-5">{chips}</div>
      <p className="text-[11px] text-muted">{footer}</p>
      {extra}
    </section>
  );
}

/** The four stage cards of spec 7.3, every number read from the summary. */
export const StageCards = memo(function StageCards({ summary, withDate }: StageCardsProps) {
  const { In, Tagging, KnowledgeBase: kb, Out } = summary;
  const agree = Math.max(0, Tagging.Transactions - Tagging.LayersDiffer);
  const pushesOk = Math.max(0, Out.Pushes - Out.PushesFailed);
  const patchesOk = Math.max(0, Out.Patches - Out.PatchesFailed);
  const failed = Out.PushesFailed + Out.PatchesFailed;
  const byCertainty = [...kb.ByCertainty].sort((a, b) => b.Rank - a.Rank);

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
      <StageCard
        number={1}
        title="In from BwaTech"
        big={formatCount(In.TransactionsRead)}
        unit="transactions read"
        chips={(
          <>
            <Badge variant="info" size="xs">{`${formatCount(In.Deliveries)} deliveries`}</Badge>
            {In.ByDataSetType.map((d) => <Badge key={d.Key} variant="gray" size="xs">{`${feedChipLabel(d.Key)} ${formatCount(d.Count)}`}</Badge>)}
          </>
        )}
        footer={In.LastDeliveryUtc ? `Last delivery ${formatLocalTime(In.LastDeliveryUtc, withDate)}` : 'No delivery'}
        health={<HealthBadge health={inHealth(In)} />}
      />
      <StageCard
        number={2}
        title="Tagged by TEP"
        big={`${taggedPercent(Tagging.Tagged, Tagging.Transactions)}%`}
        unit={`${formatCount(Tagging.Tagged)} of ${formatCount(Tagging.Transactions)} tagged`}
        chips={(
          <>
            <Badge variant="success" size="xs">{`${formatCount(Tagging.Tagged)} tagged`}</Badge>
            <Badge variant="danger" size="xs">{`${formatCount(Tagging.Untagged)} untagged`}</Badge>
            <Badge variant="info" size="xs">{`${formatCount(Tagging.LayersDiffer)} not released yet`}</Badge>
          </>
        )}
        footer={`Published and operator tags agree on ${formatCount(agree)} rows`}
        health={<HealthBadge health={taggingHealth(Tagging)} />}
      />
      <StageCard
        number={3}
        title="Knowledge base"
        big={kb.Active ? formatCount(kb.Eligible) : DASH}
        unit={kb.Active ? 'credits asked' : ''}
        chips={kb.Active ? (
          <>
            <Badge variant="success" size="xs">{`${formatCount(kb.Promoted)} promoted`}</Badge>
            <Badge variant="gray" size="xs">{`${formatCount(kb.NotKnown)} not known`}</Badge>
            <Badge variant="warning" size="xs">{`${formatCount(kb.Pending)} pending`}</Badge>
          </>
        ) : null}
        footer={kb.Active ? `${formatCount(kb.Calls)} calls · median ${formatDurationMs(kb.MedianCallMs)}` : 'Knowledge base not enabled on this environment'}
        health={kb.Active ? <HealthBadge health={kbHealth(kb)} /> : null}
        dimmed={!kb.Active}
        extra={kb.Active && byCertainty.length > 0 ? (
          <div className="flex flex-wrap gap-1" aria-label="By certainty">
            {byCertainty.map((c) => <CertaintyPill key={`${c.Rank}-${c.Label}`} certainty={`${c.Label} ${formatCount(c.Count)}`} rank={c.Rank} />)}
          </div>
        ) : null}
      />
      <StageCard
        number={4}
        title="Out to BwaTech"
        big={formatCount(Out.Calls)}
        unit="calls sent"
        chips={(
          <>
            <Badge variant="success" size="xs">{`${formatCount(pushesOk)} pushes OK`}</Badge>
            <Badge variant="success" size="xs">{`${formatCount(patchesOk)} patches OK`}</Badge>
            {failed > 0 && <Badge variant="danger" size="xs">{`${formatCount(failed)} failed`}</Badge>}
          </>
        )}
        footer={`Receipt to push median ${formatDurationMs(Out.MedianReceiptToPushMs)}`}
        health={<HealthBadge health={outHealth(Out)} />}
      />
    </div>
  );
});
