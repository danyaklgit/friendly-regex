import { useMemo } from 'react';
import { CLIENT_SYNC_LAYERS, type ClientSyncLayer } from '../../api/clientSync';
import type { VipClient } from '../../hooks/useVipClients';
import type { ClientSyncControls, ClientSyncMode } from '../../utils/clientSync/scope';
import { LAYER_LABELS, LAYER_TITLES } from '../../utils/clientSync/status';
import { accountChipName } from '../../utils/clientSync/format';
import { SearchableSelect } from '../shared/SearchableSelect';
import { GroupPillSelector } from '../shared/GroupPillSelector';
import { SegmentedControl } from '../shared/SegmentedControl';
import { DateField } from '../shared/DateField';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { ReportErrorCard } from '../reports/ReportErrorCard';
import { LiveCaption } from './LiveCaption';

interface ScopeBarProps {
  clients: VipClient[];
  clientsLoading: boolean;
  clientsError: string | null;
  onRetryClients: () => void;
  controls: ClientSyncControls;
  onChange: (patch: Partial<ClientSyncControls>) => void;
  rangeError: string | null;
  generatedAtUtc: string | null;
  loading: boolean;
  onRefresh: () => void;
}

const MODE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: 'range' as const, label: 'Range' },
];
const LAYER_OPTIONS = CLIENT_SYNC_LAYERS.map((value) => ({ value, label: LAYER_LABELS[value], title: LAYER_TITLES[value] }));

/** Spec 7.1: client, accounts, business day or range, layer, auto-refresh, refresh and the live caption. */
export function ScopeBar({
  clients, clientsLoading, clientsError, onRetryClients, controls, onChange, rangeError, generatedAtUtc, loading, onRefresh,
}: ScopeBarProps) {
  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.orgId, label: c.name, sublabel: `${c.orgId} · ${c.accounts.length} account${c.accounts.length === 1 ? '' : 's'}` })),
    [clients],
  );
  const client = clients.find((c) => c.orgId === controls.orgId) ?? null;
  const chips = useMemo(
    () => (client ? client.accounts.map((a) => ({ tag: a.iban, name: accountChipName(a.iban, a.bankCode, a.accountName) })) : []),
    [client],
  );
  const selected = useMemo(() => new Set(controls.ibans), [controls.ibans]);

  return (
    <section aria-label="Scope" className="space-y-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="w-72">
          {clientsError ? (
            <ReportErrorCard message={clientsError} onRetry={onRetryClients} />
          ) : (
            <SearchableSelect
              label="Client (VIP customer)"
              value={controls.orgId}
              onChange={(orgId) => onChange({ orgId, ibans: [] })}
              options={clientOptions}
              placeholder={clientsLoading ? 'Loading clients…' : 'Select a client'}
              disabled={clientsLoading}
            />
          )}
        </div>
        {client && (
          <div className="min-w-64 flex-1">
            <GroupPillSelector
              label="Accounts (none selected = all)"
              groups={chips}
              selected={selected}
              onChange={(next) => onChange({ ibans: [...next] })}
              emptyLabel="This client has no accounts"
            />
            <div className="mt-1">
              <Button variant="ghost" size="xs" disabled={controls.ibans.length === 0} onClick={() => onChange({ ibans: [] })}>All accounts</Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl<ClientSyncMode> label="Business day" size="sm" options={MODE_OPTIONS} value={controls.mode} onChange={(mode) => onChange({ mode })} />
        {controls.mode === 'range' && (
          <>
            <DateField label="From" compact inlineLabel value={controls.from} onChange={(from) => onChange({ from })} onClear={() => onChange({ from: '' })} disabled={false} max={controls.to || undefined} error={rangeError !== null} />
            <DateField label="To" compact inlineLabel value={controls.to} onChange={(to) => onChange({ to })} onClear={() => onChange({ to: '' })} disabled={false} min={controls.from || undefined} error={rangeError !== null} />
          </>
        )}
        {rangeError && <span role="alert" className="text-xs text-red-600 dark:text-red-400">{rangeError}</span>}
        <SegmentedControl<ClientSyncLayer> label="Statement layer" size="sm" options={LAYER_OPTIONS} value={controls.layer} onChange={(layer) => onChange({ layer })} />
        <div className="ml-auto flex items-center gap-3">
          <LiveCaption generatedAtUtc={generatedAtUtc} autoRefresh={controls.autoRefresh} />
          <Toggle label="Auto-refresh 30 s" checked={controls.autoRefresh} onChange={(autoRefresh) => onChange({ autoRefresh })} />
          <Button variant="secondary" size="xs" onClick={onRefresh} disabled={!controls.orgId} loading={loading}>Refresh</Button>
        </div>
      </div>
    </section>
  );
}
