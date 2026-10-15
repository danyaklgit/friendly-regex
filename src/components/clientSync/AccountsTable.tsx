import { memo } from 'react';
import type { ClientSyncAccount } from '../../api/clientSync';
import { Badge } from '../shared/Badge';
import { AccountStateBadge } from './StatusBadges';
import { feedChipLabel } from '../../utils/clientSync/status';
import { formatLocalTime, formatDurationMs, groupIban, DASH } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';

interface AccountsTableProps {
  accounts: ClientSyncAccount[];
  withDate: boolean;
}

const TH = 'text-left px-3 py-2 whitespace-nowrap';
const TD = 'px-3 py-2 whitespace-nowrap align-top';
const NUM = `${TD} text-right tabular-nums`;
const RED = 'text-red-600 dark:text-red-400';

/** One row per account of the summary (spec 7.4). Table classes mirror the Integration Logs tab. */
export const AccountsTable = memo(function AccountsTable({ accounts, withDate }: AccountsTableProps) {
  return (
    <section aria-label="Accounts" className="rounded-lg border border-border bg-surface overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-secondary text-[10px] font-semibold uppercase tracking-wider text-body-secondary">
          <tr>
            <th className={TH}>Account</th>
            <th className={TH}>Bank</th>
            <th className={TH}>Feeds</th>
            <th className={TH}>Last delivery</th>
            <th className={`${TH} text-right`}>Transactions</th>
            <th className={`${TH} text-right`}>Untagged</th>
            <th className={`${TH} text-right`}>KB pending</th>
            <th className={`${TH} text-right`}>Out failures</th>
            <th className={`${TH} text-right`}>In to out median</th>
            <th className={TH}>State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-xs">
          {accounts.length === 0 && (
            <tr><td colSpan={10} className="px-3 py-4 text-center text-muted">No accounts in this scope.</td></tr>
          )}
          {accounts.map((a) => (
            <tr key={a.IBAN}>
              <td className={`${TD} font-mono text-heading`}>
                {groupIban(a.IBAN)}
                {a.AccountName && <div className="font-sans text-[11px] text-muted">{a.AccountName}</div>}
              </td>
              <td className={TD}>{a.BankSwiftCode || DASH}</td>
              <td className={TD}>{a.DataSetTypes.length > 0 ? a.DataSetTypes.map(feedChipLabel).join(', ') : DASH}</td>
              <td className={TD}>{a.LastDeliveryUtc ? formatLocalTime(a.LastDeliveryUtc, withDate) : <span className="text-muted">no delivery</span>}</td>
              <td className={NUM}>{formatCount(a.Transactions)}</td>
              <td className={`${NUM} ${a.Untagged > 0 ? RED : ''}`}>{formatCount(a.Untagged)}</td>
              <td className={NUM}>{formatCount(a.KbPending)}</td>
              <td className={`${NUM} ${a.OutFailures > 0 ? RED : ''}`}>{formatCount(a.OutFailures)}</td>
              <td className={NUM}>{formatDurationMs(a.MedianReceiptToPushMs)}</td>
              <td className={TD}>
                <span className="inline-flex items-center gap-1">
                  <AccountStateBadge state={a.State} />
                  {!a.KbEnabled && <Badge variant="gray" size="xs">KB off</Badge>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
