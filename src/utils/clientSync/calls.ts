import type { ClientSyncCall } from '../../api/clientSync';
import type { IntegrationLog } from '../../api/transactions';

/** Helpers for the trace drawer's call lines. */

export function sortCallsOldestFirst<T extends ClientSyncCall>(calls: readonly T[]): T[] {
  return [...calls].sort((a, b) => a.CallStartUtc.localeCompare(b.CallStartUtc));
}

/** Badge text: StatusCode, else StatusType, else the outcome. */
export function callBadgeText(call: ClientSyncCall): string {
  return call.StatusCode ?? call.StatusType ?? (call.Succeeded ? 'OK' : 'Failed');
}

export function callTone(call: ClientSyncCall): 'success' | 'danger' {
  return call.Succeeded ? 'success' : 'danger';
}

/** insert for PushProcessedStatement; update or delete for PatchTransactions by Operation; else the raw operation. */
export function outOperationLabel(endpoint: string, operation: string): string {
  if (endpoint === 'PushProcessedStatement') return 'insert';
  if (endpoint === 'PatchTransactions') return /delete/i.test(operation) ? 'delete' : 'update';
  return operation;
}

/** The viewer fetches by Id only; everything else is display. */
export function callToIntegrationLog(call: ClientSyncCall): IntegrationLog {
  return {
    Id: call.LogId,
    Endpoint: call.Endpoint,
    StatementId: call.StatementId,
    RequestFilePath: '',
    ResponseFilePath: '',
    CallStartDate: call.CallStartUtc,
    CallEndDate: '',
    StatusType: call.StatusType,
    StatusCode: call.StatusCode,
    StatusDescription: call.StatusDescription,
    Operation: call.Operation || null,
    DataSetType: call.DataSetType,
    BankSwiftCode: call.BankSwiftCode,
    IBANs: call.IBANs,
    BusinessDate: call.BusinessDate,
    RecordCount: call.RecordCount,
    RerunOfId: call.RerunOfId,
  };
}

export function firstAcceptedDelivery(calls: readonly ClientSyncCall[]): ClientSyncCall | null {
  return sortCallsOldestFirst(calls).find((c) => c.Succeeded) ?? null;
}
