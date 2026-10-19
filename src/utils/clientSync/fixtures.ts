import type {
  ClientSyncAccount, ClientSyncCall, ClientSyncKbCall, ClientSyncKbState, ClientSyncOutCall, ClientSyncSummary,
  ClientSyncTagState, ClientSyncTrace, ClientSyncTransaction, ClientSyncTransactionsPage, ClientSyncWarning,
} from '../../api/clientSync';

/** Test-only builders. Imported by *.test files only; never by app code. */

export function makeAccountFixture(partial: Partial<ClientSyncAccount> = {}): ClientSyncAccount {
  return {
    IBAN: 'SA0380000000608010167519', BankSwiftCode: 'RJHISARI', AccountName: 'Main SAR', DataSetTypes: ['INTERIM_TransactionsList', 'MT940'],
    Deliveries: 9, LastDeliveryUtc: '2026-10-15T07:55:02Z', Transactions: 150, Untagged: 10,
    KbEnabled: true, KbPromoted: 40, KbPending: 4, OutFailures: 1, RowsNotSent: 5, MedianReceiptToPushMs: 1700, State: 'ATTENTION',
    ...partial,
  };
}

export function makeWarningFixture(partial: Partial<ClientSyncWarning> = {}): ClientSyncWarning {
  return { Level: 'WARNING', Code: 'OUT_FAILED', IBAN: 'SA0380000000608010167519', Count: 5, Message: '5 rows failed on the last push.', Show: 'OUT_FAILED', ...partial };
}

export function makeSummaryFixture(partial: Partial<ClientSyncSummary> = {}): ClientSyncSummary {
  return {
    OrgId: 'ORG-1', ClientName: 'Acme Trading', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL', GeneratedAtUtc: '2026-10-15T08:00:00Z',
    In: { Deliveries: 14, Accepted: 14, Duplicates: 0, Rejected: 0, TransactionsRead: 212, ByDataSetType: [{ Key: 'INTERIM_TransactionsList', Count: 180 }, { Key: 'MT940', Count: 32 }], LastDeliveryUtc: '2026-10-15T07:55:02Z' },
    Tagging: { Transactions: 212, Tagged: 197, Untagged: 15, DeadEnds: 3, LayersDiffer: 2, MissingMandatoryAttributes: 4, ByTag: [{ Key: 'IncomingTransfer', Count: 120 }] },
    KnowledgeBase: { Active: true, Eligible: 61, Promoted: 48, NotKnown: 9, Pending: 4, ByCertainty: [{ Rank: 3, Label: 'Likely', Count: 18, ReceivedAs: ['LIKELY'] }, { Rank: 5, Label: 'Confirmed', Count: 30, ReceivedAs: ['CONFIRMED'] }], Calls: 61, FailedCalls: 0, MedianCallMs: 412, LastCallUtc: '2026-10-15T07:50:00Z' },
    Out: { Calls: 17, Pushes: 14, PushesFailed: 1, Patches: 3, PatchesFailed: 0, RowsSent: 205, RowsNotSent: 7, RowsNotSentByDesign: 2, RowsLastCallFailed: 5, MedianReceiptToPushMs: 1800, LastCallUtc: '2026-10-15T07:56:00Z' },
    Accounts: [
      makeAccountFixture(),
      makeAccountFixture({ IBAN: 'SA4420000001234567891234', AccountName: 'Payroll', DataSetTypes: ['MT940'], Deliveries: 0, LastDeliveryUtc: null, Transactions: 0, Untagged: 0, KbEnabled: false, KbPromoted: 0, KbPending: 0, OutFailures: 0, RowsNotSent: 0, MedianReceiptToPushMs: null, State: 'IDLE' }),
    ],
    Warnings: [
      makeWarningFixture(),
      makeWarningFixture({ Level: 'INFO', Code: 'LAYERS_DIFFER', IBAN: null, Count: 2, Message: '2 transaction(s) carry an operator tag that is not released yet; BwaTech holds the published one.', Show: 'LAYERS_DIFFER' }),
    ],
    ...partial,
  };
}

export function makeTransactionFixture(partial: Partial<ClientSyncTransaction> = {}): ClientSyncTransaction {
  return {
    Id: 'tx-1', ReceivedAtUtc: '2026-10-15T06:55:02Z', DataSetType: 'INTERIM_TransactionsList', IsConfirmed: false, IsArchived: false,
    BusinessDate: '2026-10-15', IBAN: 'SA0380000000608010167519', BankSwiftCode: 'RJHISARI', StatementId: 'STMT-1', Sequence: 12,
    Side: 'CR', Amount: 12500, CurrencyCode: 'SAR', Sender: 'AL FARIS CO', Narrative: 'INV 2231 AL FARIS CO', BankReference: 'FT26288H51MC',
    Tag: 'IncomingTransfer', OpsTag: 'IncomingTransfer', IsUntagged: false, IsDeadEnd: false, LayersDiffer: false, AttributeCount: 3, MissingMandatoryAttributes: 0,
    Kb: { Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co' },
    Out: { Status: 'SENT', LastCallUtc: '2026-10-15T06:55:35Z', LastError: null, ReceiptToPushMs: 33000 },
    Attributes: [], KbAttributes: [],
    ...partial,
  };
}

export function makePageFixture(rows: ClientSyncTransaction[] = [makeTransactionFixture()], partial: Partial<ClientSyncTransactionsPage> = {}): ClientSyncTransactionsPage {
  return {
    Transactions: rows,
    TotalCount: rows.length,
    ShowCounts: [{ Key: 'ALL', Count: rows.length }, { Key: 'UNTAGGED', Count: 0 }],
    PageIndex: 1,
    PageSize: 100,
    ...partial,
  };
}

export function makeCallFixture(partial: Partial<ClientSyncCall> = {}): ClientSyncCall {
  return {
    LogId: 'log-1', Endpoint: 'ProcessTransactionsForTagging', Operation: '', CallStartUtc: '2026-10-15T06:55:00Z', DurationMs: 420,
    StatusType: 'Information', StatusCode: '0', StatusDescription: 'OK', Succeeded: true, RecordCount: 40,
    HasRequestFile: true, HasResponseFile: true, RerunOfId: null,
    StatementId: '129915638', DataSetType: 'INTERIM_TransactionsList', BankSwiftCode: 'RJHISARI',
    IBANs: ['SA0380000000608010167519'], BusinessDate: '2026-10-15',
    ...partial,
  };
}

export function makeKbCallFixture(partial: Partial<ClientSyncKbCall> = {}): ClientSyncKbCall {
  return {
    ...makeCallFixture({ LogId: 'log-2', Endpoint: 'PerformMemoryBasedPromotion', CallStartUtc: '2026-10-15T06:55:10Z', DurationMs: 390, RecordCount: 1 }),
    RecordIds: ['tx-1'], RequestRecordJson: '{"payer":"AL FARIS CO"}', ResponseRecordJson: '{"code":"C-100"}',
    ...partial,
  };
}

export function makeOutCallFixture(partial: Partial<ClientSyncOutCall> = {}): ClientSyncOutCall {
  return {
    ...makeCallFixture({ LogId: 'log-3', Endpoint: 'PushProcessedStatement', Operation: 'insert', CallStartUtc: '2026-10-15T06:55:35Z', DurationMs: 900 }),
    ElementJson: '{"id":"tx-1"}', ResponseText: 'OK',
    ...partial,
  };
}

export function makeTagStateFixture(partial: Partial<ClientSyncTagState> = {}): ClientSyncTagState {
  return {
    Tag: 'IncomingTransfer', Nickname: 'Transfers in', CertaintyLevel: 'HIGH', DefinitionId: '77', LibraryStatus: 'ACTIVE', LibraryVersion: 12,
    IsUntagged: false, IsDeadEnd: false, IsMultiTag: false, OtherTags: [],
    Attributes: [
      { Key: 'payer_name', Value: 'AL FARIS CO', IsMandatory: true, IsValid: true },
      { Key: 'invoice', Value: 'INV 2231', IsMandatory: false, IsValid: false },
    ],
    ...partial,
  };
}

export function makeKbStateFixture(partial: Partial<ClientSyncKbState> = {}): ClientSyncKbState {
  return {
    Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co',
    CustomerNameAr: 'شركة الفارس', CustomerLevel: 'Gold', CustomerType: 'Corporate', Alternatives: 1,
    ...partial,
  };
}

export function makeTraceFixture(partial: Partial<ClientSyncTrace> = {}): ClientSyncTrace {
  return {
    Transaction: makeTransactionFixture(),
    In: {
      Deliveries: [makeCallFixture()], ItemText: '{"ref":"FT26288H51MC"}', ItemFormat: 'json',
      RawFileName: 'anb_20261015_0655.json', RawCreatedUtc: '2026-10-15T06:54:58Z', RawProcessedUtc: '2026-10-15T06:55:01Z',
      RawStoredTransactionCount: 40, LateArrival: false,
    },
    Tagging: { Published: makeTagStateFixture(), Operator: makeTagStateFixture({ Nickname: null, LibraryStatus: 'INPROGRESS', LibraryVersion: 13 }), LayersDiffer: false },
    Kb: {
      Published: makeKbStateFixture(), Operator: makeKbStateFixture({ CustomerNameAr: null, Alternatives: 0 }),
      PublishedAttributes: [{ Key: 'kb_customer_code', Value: 'C-100' }],
      Calls: [makeKbCallFixture()],
    },
    Out: {
      Calls: [makeOutCallFixture()], CurrentTag: 'IncomingTransfer',
      CurrentAttributes: [{ Key: 'kb_customer_code', Value: 'C-100' }, { Key: 'payer_name', Value: 'AL FARIS CO' }],
      DeletedAtBwatech: false,
    },
    ...partial,
  };
}
