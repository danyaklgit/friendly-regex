import { getVIPCustomers, type VIPCustomer } from '../api/vipCustomers';
import type { TepHeaders } from '../api/transactions';
import { groupByOrg, accountNameFor } from '../utils/vipCustomers';
import { useReportRequest, type ReportFetcher } from './useReportRequest';

export interface VipClientAccount { iban: string; bankCode: string; accountName: string }
export interface VipClient { orgId: string; name: string; accounts: VipClientAccount[] }

/** One picker option per OrgId. Name: the en org name, else the first org name, else the id. Accounts sorted by IBAN (groupByOrg). */
export function toVipClients(customers: VIPCustomer[]): VipClient[] {
  return groupByOrg(customers)
    .map((g) => ({
      orgId: g.orgId,
      name: g.orgNameEn || g.orgId,
      accounts: g.accounts.map((a) => ({ iban: a.IBAN, bankCode: a.BankCode ?? '', accountName: accountNameFor(a.AccountNames) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.orgId.localeCompare(b.orgId));
}

const EMPTY_REQUEST: Record<string, never> = {};
const EMPTY_CLIENTS: VipClient[] = [];
const fetchVipClients: ReportFetcher<Record<string, never>, VipClient[]> = async (_request, token, headers, signal) =>
  toVipClients(await getVIPCustomers(token, headers, signal));

export interface VipClientsState { clients: VipClient[]; loading: boolean; error: string | null; refetch: () => void }

/** GetVIPCustomers once per mount (abort-aware through useReportRequest), grouped for the client picker. */
export function useVipClients(authToken: string | null, tepHeaders: TepHeaders | null): VipClientsState {
  const { report, loading, error, refetch } = useReportRequest(EMPTY_REQUEST, fetchVipClients, authToken, tepHeaders);
  return { clients: report ?? EMPTY_CLIENTS, loading, error, refetch };
}
