import { Badge } from '../shared/Badge';
import type { AccountState, ClientSyncCall, KbStatus, OutStatus } from '../../api/clientSync';
import {
  accountStateDisplay, certaintyTone, feedChipLabel, kbStatusDisplay, outStatusDisplay, type CardHealth, type StatusTone,
} from '../../utils/clientSync/status';
import { callBadgeText, callTone } from '../../utils/clientSync/calls';
import { DASH } from '../../utils/clientSync/format';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'emerald' | 'none';
const OUTLINE = 'border border-border-strong text-body-secondary';

function toneProps(tone: StatusTone): { variant: BadgeVariant; className: string } {
  switch (tone) {
    case 'success': return { variant: 'success', className: '' };
    case 'successStrong': return { variant: 'emerald', className: '' };
    case 'warning': return { variant: 'warning', className: '' };
    case 'danger': return { variant: 'danger', className: '' };
    case 'info': return { variant: 'info', className: '' };
    case 'gray': return { variant: 'gray', className: '' };
    case 'grayOutline': return { variant: 'none', className: OUTLINE };
    case 'dash': return { variant: 'none', className: '' };
  }
}

interface ToneBadgeProps { tone: StatusTone; label: string; title?: string }

/** One badge per tone; a `dash` tone renders a muted dash instead of a pill. */
function ToneBadge({ tone, label, title }: ToneBadgeProps) {
  if (tone === 'dash') return <span className="text-muted" title={title}>{DASH}</span>;
  const { variant, className } = toneProps(tone);
  return (
    <Badge variant={variant} size="xs" className={className}>
      <span title={title}>{label}</span>
    </Badge>
  );
}

export function KbStatusBadge({ status, context }: { status: KbStatus; context: 'list' | 'drawer' }) {
  const d = kbStatusDisplay(status, context);
  return <ToneBadge tone={d.tone} label={d.label} />;
}

export function OutStatusBadge({ status, title }: { status: OutStatus; title?: string }) {
  const d = outStatusDisplay(status);
  return <ToneBadge tone={d.tone} label={d.label} title={title} />;
}

/** The label is always the raw certainty text; the color comes from the backend rank. */
export function CertaintyPill({ certainty, rank }: { certainty: string; rank: number }) {
  if (!certainty) return null;
  return <ToneBadge tone={certaintyTone(rank)} label={certainty} />;
}

/** kb_customer_type (TC / CC). Nothing when null: an unrecorded customer's type lives in another key. */
export function KbCustomerTypeChip({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <Badge variant="gray" size="xs">
      <span title="Knowledge-base customer type (kb_customer_type)">{type}</span>
    </Badge>
  );
}

export function AccountStateBadge({ state }: { state: AccountState }) {
  const d = accountStateDisplay(state);
  return <ToneBadge tone={d.tone} label={d.label} />;
}

export function FeedChip({ dataSetType, isArchived }: { dataSetType: string; isArchived: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="gray" size="xs">{feedChipLabel(dataSetType)}</Badge>
      {isArchived && <span className="text-[10px] text-muted">archived</span>}
    </span>
  );
}

export function CallBadge({ call }: { call: ClientSyncCall }) {
  return <ToneBadge tone={callTone(call)} label={callBadgeText(call)} title={call.StatusDescription ?? undefined} />;
}

export function HealthBadge({ health }: { health: CardHealth }) {
  return <ToneBadge tone={health.tone} label={health.label} />;
}
