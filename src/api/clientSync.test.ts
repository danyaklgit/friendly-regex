import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  getClientSyncSummary, getClientSyncTransactions, getClientSyncTrace, getAllClientSyncTransactions,
  normalizeSummary, normalizeTransactionsPage, normalizeTrace, toSummaryBody, toTransactionsBody,
  type ClientSyncScope, type ClientSyncTransactionsRequest,
} from './clientSync';
import { buildHeaders } from './checkout';
import { ApiError } from './apiError';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = { userId: 'user-1', tenantCode: 'TENANT', languageCode: 'en', timeZone: 'UTC', requestId: 'req-1' };
const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';
const SCOPE: ClientSyncScope = { OrgId: 'ORG-1', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL' };
const LIST_REQUEST: ClientSyncTransactionsRequest = { ...SCOPE, Show: 'ALL', PageIndex: 1, PageSize: 100 };

const RAW_SUMMARY = {
  OrgId: 'ORG-1', ClientName: 'Acme Trading', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL', GeneratedAtUtc: '2026-10-15T08:00:00Z',
  In: { Deliveries: 14, Accepted: 14, Duplicates: 0, Rejected: 0, TransactionsRead: 212, ByDataSetType: [{ Key: 'INTERIM_TransactionsList', Count: 180 }, { Key: 'MT940', Count: 32 }], LastDeliveryUtc: '2026-10-15T07:55:02Z' },
  Tagging: { Transactions: 212, Tagged: 197, Untagged: 15, DeadEnds: 3, LayersDiffer: 2, MissingMandatoryAttributes: 4, ByTag: [{ Key: 'IncomingTransfer', Count: 120 }] },
  KnowledgeBase: { Active: true, Eligible: 61, Promoted: 48, NotKnown: 9, Pending: 4, ByCertainty: [{ Rank: 5, Label: 'Confirmed', Count: 30, ReceivedAs: ['CONFIRMED'] }, { Rank: 3, Label: 'Likely', Count: 18, ReceivedAs: ['LIKELY'] }], Calls: 61, FailedCalls: 0, MedianCallMs: 412, LastCallUtc: '2026-10-15T07:50:00Z' },
  Out: { Calls: 17, Pushes: 14, PushesFailed: 1, Patches: 3, PatchesFailed: 0, RowsSent: 205, RowsNotSent: 7, RowsNotSentByDesign: 2, RowsLastCallFailed: 5, MedianReceiptToPushMs: 1800, LastCallUtc: '2026-10-15T07:56:00Z' },
  Accounts: [
    { IBAN: 'SA0380000000608010167519', BankSwiftCode: 'RJHISARI', AccountName: 'Main SAR', DataSetTypes: ['INTERIM_TransactionsList', 'MT940'], Deliveries: 9, LastDeliveryUtc: '2026-10-15T07:55:02Z', Transactions: 150, Untagged: 10, KbEnabled: true, KbPromoted: 40, KbPending: 4, OutFailures: 1, RowsNotSent: 5, MedianReceiptToPushMs: 1700, State: 'ATTENTION' },
    { IBAN: 'SA4420000001234567891234', BankSwiftCode: 'RJHISARI', AccountName: 'Payroll', DataSetTypes: ['MT940'], Deliveries: 0, LastDeliveryUtc: null, Transactions: 0, Untagged: 0, KbEnabled: false, KbPromoted: 0, KbPending: 0, OutFailures: 0, RowsNotSent: 0, MedianReceiptToPushMs: null, State: 'WEIRD' },
  ],
  Warnings: [
    { Level: 'WARNING', Code: 'OUT_FAILED', IBAN: 'SA0380000000608010167519', Count: 5, Message: '5 rows failed on the last push.', Show: 'OUT_FAILED' },
    { Level: 'LOUD', Code: 'X', IBAN: null, Count: null, Message: 'odd', Show: 'NOPE' },
  ],
};

const RAW_ROW = {
  Id: 'tx-1', ReceivedAtUtc: '2026-10-15T06:55:02Z', DataSetType: 'INTERIM_TransactionsList', IsConfirmed: false, IsArchived: false,
  BusinessDate: '2026-10-15', IBAN: 'SA0380000000608010167519', BankSwiftCode: 'RJHISARI', StatementId: 'STMT-1', Sequence: 12,
  Side: 'CR', Amount: 12500, CurrencyCode: 'SAR', Sender: 'AL FARIS CO', Narrative: 'INV 2231', BankReference: 'FT26288H51MC',
  Tag: 'IncomingTransfer', OpsTag: 'IncomingTransfer', IsUntagged: false, IsDeadEnd: false, LayersDiffer: false, AttributeCount: 3, MissingMandatoryAttributes: 0,
  Kb: { Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co' },
  Out: { Status: 'SENT', LastCallUtc: '2026-10-15T06:55:35Z', LastError: null, ReceiptToPushMs: 33000 },
};

const RAW_TRACE = {
  Transaction: RAW_ROW,
  In: {
    Deliveries: [{ LogId: 'log-1', Endpoint: 'ProcessTransactionsForTagging', Operation: '', CallStartUtc: '2026-10-15T06:55:00Z', DurationMs: 420, StatusType: 'Information', StatusCode: 0, StatusDescription: 'OK', Succeeded: true, RecordCount: 40, HasRequestFile: true, HasResponseFile: true, RerunOfId: null }],
    ItemText: '{"ref":"FT26288H51MC"}', ItemFormat: 'JSON', RawFileName: 'anb_20261015_0655.json', RawCreatedUtc: '2026-10-15T06:54:58Z', RawProcessedUtc: '2026-10-15T06:55:01Z', RawStoredTransactionCount: 40, LateArrival: false,
  },
  Tagging: {
    Published: { Tag: 'IncomingTransfer', Nickname: 'Transfers in', CertaintyLevel: 'HIGH', DefinitionId: 77, LibraryStatus: 'ACTIVE', LibraryVersion: 12, IsUntagged: false, IsDeadEnd: false, IsMultiTag: false, OtherTags: [], Attributes: [{ Key: 'payer_name', Value: 'AL FARIS CO', IsMandatory: true, IsValid: true }, { Key: 'invoice', Value: null, IsMandatory: false }] },
    Operator: { Tag: 'IncomingTransfer', Nickname: null, CertaintyLevel: 'HIGH', DefinitionId: '77', LibraryStatus: 'INPROGRESS', LibraryVersion: 13, IsUntagged: false, IsDeadEnd: false, IsMultiTag: false, OtherTags: [], Attributes: [] },
    LayersDiffer: false,
  },
  Kb: {
    Published: { Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co', CustomerNameAr: 'شركة الفارس', CustomerLevel: 'Gold', CustomerType: 'Corporate', Alternatives: 1 },
    Operator: { Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co', CustomerNameAr: null, CustomerLevel: null, CustomerType: null, Alternatives: 0 },
    PublishedAttributes: [{ Key: 'kb_customer_code', Value: 'C-100' }],
    Calls: [{ LogId: 'log-2', Endpoint: 'PerformMemoryBasedPromotion', Operation: '', CallStartUtc: '2026-10-15T06:55:10Z', DurationMs: 390, StatusType: 'Information', StatusCode: '0', StatusDescription: 'OK', Succeeded: true, RecordCount: 1, HasRequestFile: true, HasResponseFile: true, RerunOfId: null, RecordIds: ['tx-1'], RequestRecordJson: '{"payer":"AL FARIS CO"}', ResponseRecordJson: null }],
  },
  Out: {
    Calls: [{ LogId: 'log-3', Endpoint: 'PushProcessedStatement', Operation: 'insert', CallStartUtc: '2026-10-15T06:55:35Z', DurationMs: 900, StatusType: 'Information', StatusCode: '0', StatusDescription: 'OK', Succeeded: true, RecordCount: 40, HasRequestFile: true, HasResponseFile: true, RerunOfId: null, ElementJson: '{"id":"tx-1"}', ResponseText: 'OK' }],
    CurrentTag: 'IncomingTransfer', CurrentAttributes: [{ Key: 'kb_customer_code', Value: 'C-100' }, { Key: 'payer_name', Value: 'AL FARIS CO' }], DeletedAtBwatech: false,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('request bodies', () => {
  it('omits OrgId and IBANs when unset and always carries Layer', () => {
    expect(toSummaryBody({ FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL', IBANs: [] })).toEqual({ FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL' });
    expect(toSummaryBody({ ...SCOPE, IBANs: ['SA1', 'SA2'], Layer: 'INTRADAY' })).toEqual({ OrgId: 'ORG-1', IBANs: ['SA1', 'SA2'], FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'INTRADAY' });
  });

  it('omits a blank Search and trims a set one', () => {
    expect(toTransactionsBody({ ...LIST_REQUEST, Search: '   ' })).toEqual({ OrgId: 'ORG-1', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL', Show: 'ALL', PageIndex: 1, PageSize: 100 });
    expect(toTransactionsBody({ ...LIST_REQUEST, Show: 'UNTAGGED', Search: ' FT26 ' })).toMatchObject({ Show: 'UNTAGGED', Search: 'FT26' });
  });

  it('sends Side, Tags, KbCustomerTypes and KbCertaintyRanks only when set', () => {
    const plain = toTransactionsBody({ ...LIST_REQUEST, Tags: [], KbCustomerTypes: [], KbCertaintyRanks: [] });
    expect(plain).not.toHaveProperty('Side');
    expect(plain).not.toHaveProperty('Tags');
    expect(plain).not.toHaveProperty('KbCustomerTypes');
    expect(plain).not.toHaveProperty('KbCertaintyRanks');
    expect(toTransactionsBody({ ...LIST_REQUEST, Side: 'DR', Tags: ['UNTAGGED', 'IncomingTransfer'], KbCustomerTypes: ['TC'], KbCertaintyRanks: [5, 4] }))
      .toMatchObject({ Side: 'DR', Tags: ['UNTAGGED', 'IncomingTransfer'], KbCustomerTypes: ['TC'], KbCertaintyRanks: [5, 4], PageIndex: 1, PageSize: 100 });
  });
});

describe('fetchers', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>; });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('POSTs the summary with the standard header bundle', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Summary: RAW_SUMMARY, SFM: {} }));
    const controller = new AbortController();
    const summary = await getClientSyncSummary(SCOPE, TOKEN, tepHeaders, controller.signal);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetClientSyncSummary`);
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toEqual(buildHeaders(TOKEN, tepHeaders, 'GetClientSyncSummary'));
    expect(JSON.parse(init.body as string)).toEqual({ OrgId: 'ORG-1', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL' });
    expect(summary.ClientName).toBe('Acme Trading');
  });

  it('POSTs the transactions request and the trace request with their action tags', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Transactions: [RAW_ROW], TotalCount: 1, ShowCounts: [{ Key: 'ALL', Count: 1 }], PageIndex: 1, PageSize: 100, SFM: {} }));
    const page = await getClientSyncTransactions(LIST_REQUEST, TOKEN, tepHeaders);
    expect((fetchSpy.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/GetClientSyncTransactions`);
    expect(((fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>).ActivityTag).toBe('GetClientSyncTransactions');
    expect(page.Transactions[0].Id).toBe('tx-1');

    fetchSpy.mockResolvedValueOnce(jsonResponse({ Trace: RAW_TRACE, SFM: {} }));
    const trace = await getClientSyncTrace({ TransactionId: 'tx-1' }, TOKEN, tepHeaders);
    const [url, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetClientSyncTrace`);
    expect(JSON.parse(init.body as string)).toEqual({ TransactionId: 'tx-1' });
    expect(trace.Transaction.Id).toBe('tx-1');
  });

  it('walks every page of the same query at PageSize 2000 for the export, dropping rows repeated across pages', async () => {
    const row = (Id: string) => ({ ...RAW_ROW, Id, BankReference: `REF-${Id}` });
    const columns = ['SenderBank', 'kb_outlet_customer_code'];
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ Transactions: [row('a'), row('b')], TotalCount: 4001, AttributeColumns: columns }))
      .mockResolvedValueOnce(jsonResponse({ Transactions: [row('b'), row('c')], TotalCount: 4001, AttributeColumns: columns }))
      .mockResolvedValueOnce(jsonResponse({ Transactions: [row('d'), { ...RAW_ROW, Id: '' }, { ...RAW_ROW, Id: '' }], TotalCount: 4001, AttributeColumns: columns }));
    const result = await getAllClientSyncTransactions({ ...LIST_REQUEST, Side: 'CR', Tags: ['IncomingTransfer'], KbCertaintyRanks: [5, 4], PageSize: 150 }, TOKEN, tepHeaders);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const bodies = fetchSpy.mock.calls.map((c) => JSON.parse((c as [string, RequestInit])[1].body as string));
    expect(bodies.map((b) => [b.PageIndex, b.PageSize])).toEqual([[1, 2000], [2, 2000], [3, 2000]]);
    expect(bodies[2]).toMatchObject({ Side: 'CR', Tags: ['IncomingTransfer'], KbCertaintyRanks: [5, 4], Show: 'ALL' });
    expect(result.rows.map((r) => r.Id)).toEqual(['a', 'b', 'c', 'd', '', '']);
    expect(result.attributeColumns).toEqual(columns);
  });

  it('stops the export walk at an empty page and needs one request when everything fits', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ Transactions: [RAW_ROW], TotalCount: 6000 }))
      .mockResolvedValueOnce(jsonResponse({ Transactions: [], TotalCount: 1 }));
    expect((await getAllClientSyncTransactions(LIST_REQUEST, TOKEN, tepHeaders)).rows).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockClear();
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Transactions: [RAW_ROW], TotalCount: 1 }));
    expect(await getAllClientSyncTransactions(LIST_REQUEST, TOKEN, tepHeaders)).toEqual({ rows: [expect.objectContaining({ Id: 'tx-1' })], attributeColumns: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with the SFM short description on a non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Minor: [{ MinorRetCodeDetails: [{ ShortDescription: 'SFM_INVALID_INPUT_PARAMETERS' }] }] } }, 400));
    const promise = getClientSyncSummary(SCOPE, TOKEN, tepHeaders);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: 'SFM_INVALID_INPUT_PARAMETERS', status: 400 });
  });
});

describe('normalizeSummary', () => {
  it('reads the document example', () => {
    const s = normalizeSummary(RAW_SUMMARY);
    expect(s.In.TransactionsRead).toBe(212);
    expect(s.In.ByDataSetType).toEqual([{ Key: 'INTERIM_TransactionsList', Count: 180 }, { Key: 'MT940', Count: 32 }]);
    expect(s.Tagging.Tagged).toBe(197);
    expect(s.KnowledgeBase.ByCertainty[0]).toEqual({ Rank: 5, Label: 'Confirmed', Count: 30, ReceivedAs: ['CONFIRMED'] });
    expect(s.Out.MedianReceiptToPushMs).toBe(1800);
    expect(s.Accounts[0].State).toBe('ATTENTION');
    expect(s.Accounts[1].MedianReceiptToPushMs).toBeNull();
    expect(s.Warnings[0]).toEqual({ Level: 'WARNING', Code: 'OUT_FAILED', IBAN: 'SA0380000000608010167519', Count: 5, Message: '5 rows failed on the last push.', Show: 'OUT_FAILED' });
  });

  it('falls back on unknown enum values: State to IDLE, Level to INFO, Show to null', () => {
    const s = normalizeSummary(RAW_SUMMARY);
    expect(s.Accounts[1].State).toBe('IDLE');
    expect(s.Warnings[1].Level).toBe('INFO');
    expect(s.Warnings[1].Show).toBeNull();
  });

  it('normalizes a sparse payload to zeros and empties, with the knowledge base active unless explicitly false', () => {
    const s = normalizeSummary({});
    expect(s.In).toEqual({ Deliveries: 0, Accepted: 0, Duplicates: 0, Rejected: 0, TransactionsRead: 0, ByDataSetType: [], LastDeliveryUtc: null });
    expect(s.KnowledgeBase.Active).toBe(true);
    expect(s.KnowledgeBase.MedianCallMs).toBeNull();
    expect(s.Accounts).toEqual([]);
    expect(s.Warnings).toEqual([]);
    expect(s.Layer).toBe('ALL');
    expect(normalizeSummary({ KnowledgeBase: { Active: false } }).KnowledgeBase.Active).toBe(false);
    expect(s.KnowledgeBase.ByCustomerType).toEqual([]);
    expect(normalizeSummary({ KnowledgeBase: { ByCustomerType: [{ Key: 'TC', Count: 812 }, { Key: '', Count: 3 }, { Key: 'CC', Count: '95' }] } }).KnowledgeBase.ByCustomerType)
      .toEqual([{ Key: 'TC', Count: 812 }, { Key: 'CC', Count: 95 }]);
    expect(normalizeSummary(null).OrgId).toBe('');
  });
});

describe('normalizeTransactionsPage', () => {
  it('reads the page from the root or from a Page wrapper', () => {
    const fromRoot = normalizeTransactionsPage({ Transactions: [RAW_ROW], TotalCount: 212, ShowCounts: [{ Key: 'UNTAGGED', Count: 15 }], PageIndex: 1, PageSize: 100 }, LIST_REQUEST);
    expect(fromRoot.TotalCount).toBe(212);
    expect(fromRoot.ShowCounts).toEqual([{ Key: 'UNTAGGED', Count: 15 }]);
    expect(fromRoot.Transactions[0].Kb).toEqual({ Status: 'Promoted', Certainty: 'Confirmed', CertaintyRank: 5, CustomerCode: 'C-100', CustomerNameEn: 'Al Faris Co', KbCustomerType: null });
    expect(fromRoot.Transactions[0].Out).toEqual({ Status: 'SENT', LastCallUtc: '2026-10-15T06:55:35Z', LastError: null, ReceiptToPushMs: 33000 });
    const wrapped = normalizeTransactionsPage({ Page: { Transactions: [RAW_ROW], TotalCount: 1 } }, LIST_REQUEST);
    expect(wrapped.Transactions).toHaveLength(1);
    expect(wrapped.PageIndex).toBe(1);
    expect(wrapped.PageSize).toBe(100);
  });

  it('defaults a sparse row: unknown Kb.Status to NotEligible, Out.Status to UNTRACKED, missing objects to defaults, TotalCount to the row count', () => {
    const page = normalizeTransactionsPage({ Transactions: [{ Id: 'x', Kb: { Status: 'Maybe' }, Out: { Status: 'LOST' } }, 'junk', { Id: 'y' }] }, LIST_REQUEST);
    expect(page.TotalCount).toBe(3);
    expect(page.Transactions[0].Kb.Status).toBe('NotEligible');
    expect(page.Transactions[0].Out.Status).toBe('UNTRACKED');
    expect(page.Transactions[1].Id).toBe('');
    expect(page.Transactions[2]).toMatchObject({ Id: 'y', Amount: 0, Side: '', IsUntagged: false, AttributeCount: 0, ReceivedAtUtc: null, Sequence: null });
    expect(page.Transactions[2].Kb).toEqual({ Status: 'NotEligible', Certainty: '', CertaintyRank: 0, CustomerCode: null, CustomerNameEn: null, KbCustomerType: null });
    expect(page.Transactions[2].Out).toEqual({ Status: 'UNTRACKED', LastCallUtc: null, LastError: null, ReceiptToPushMs: null });
    expect(page.Transactions[2].WireAttributes).toEqual([]);
    expect(normalizeTransactionsPage(undefined, LIST_REQUEST)).toEqual({ Transactions: [], TotalCount: 0, ShowCounts: [], PageIndex: 1, PageSize: 100, AttributeColumns: [] });
  });

  it('reads each row\'s tag attributes and knowledge-base attributes, defaulting both to empty', () => {
    const page = normalizeTransactionsPage({
      Transactions: [
        {
          ...RAW_ROW,
          Attributes: [{ Key: 'SenderName', Value: 'AL FARIS CO', IsMandatory: true, IsValid: false }, { Key: 'Invoice', Value: null }],
          KbAttributes: [{ Key: 'kb_displayed_customer_name_ar', Value: 'شركة الفارس' }, { Key: 'kb_outlet_customer_code', Value: null }],
        },
        RAW_ROW,
      ],
    }, LIST_REQUEST);
    expect(page.Transactions[0].Attributes).toEqual([
      { Key: 'SenderName', Value: 'AL FARIS CO', IsMandatory: true, IsValid: false },
      { Key: 'Invoice', Value: null, IsMandatory: false, IsValid: true },
    ]);
    expect(page.Transactions[0].KbAttributes).toEqual([
      { Key: 'kb_displayed_customer_name_ar', Value: 'شركة الفارس' },
      { Key: 'kb_outlet_customer_code', Value: null },
    ]);
    expect(page.Transactions[1].Attributes).toEqual([]);
    expect(page.Transactions[1].KbAttributes).toEqual([]);
  });

  it('reads the export column order, each row\'s wire attributes and its KB customer type (blank reads as absent)', () => {
    const page = normalizeTransactionsPage({
      AttributeColumns: ['SenderBank', '', 'kb_outlet_customer_code', 42],
      Transactions: [
        { ...RAW_ROW, Kb: { ...RAW_ROW.Kb, KbCustomerType: 'TC' }, WireAttributes: [{ Key: 'SenderBank', Value: 'RJHI' }, { Key: 'kb_outlet_customer_code', Value: null }] },
        { ...RAW_ROW, Kb: { ...RAW_ROW.Kb, KbCustomerType: '  ' } },
      ],
    }, LIST_REQUEST);
    expect(page.AttributeColumns).toEqual(['SenderBank', 'kb_outlet_customer_code']);
    expect(page.Transactions[0].Kb.KbCustomerType).toBe('TC');
    expect(page.Transactions[0].WireAttributes).toEqual([{ Key: 'SenderBank', Value: 'RJHI' }, { Key: 'kb_outlet_customer_code', Value: null }]);
    expect(page.Transactions[1].Kb.KbCustomerType).toBeNull();
  });
});

describe('normalizeTrace', () => {
  it('reads the document example, stringifying numeric codes and ids and lower-casing the item format', () => {
    const t = normalizeTrace(RAW_TRACE);
    expect(t.Transaction.Id).toBe('tx-1');
    expect(t.In.Deliveries[0]).toMatchObject({ LogId: 'log-1', StatusCode: '0', Succeeded: true, RecordCount: 40, HasRequestFile: true });
    expect(t.In.ItemFormat).toBe('json');
    expect(t.In.RawStoredTransactionCount).toBe(40);
    expect(t.Tagging.Published.DefinitionId).toBe('77');
    expect(t.Tagging.Published.Attributes).toEqual([
      { Key: 'payer_name', Value: 'AL FARIS CO', IsMandatory: true, IsValid: true },
      { Key: 'invoice', Value: null, IsMandatory: false, IsValid: true },
    ]);
    expect(t.Kb.Published.CustomerNameAr).toBe('شركة الفارس');
    expect(t.Kb.Calls[0]).toMatchObject({ RecordIds: ['tx-1'], RequestRecordJson: '{"payer":"AL FARIS CO"}', ResponseRecordJson: null });
    expect(t.Out.Calls[0]).toMatchObject({ Operation: 'insert', ElementJson: '{"id":"tx-1"}', ResponseText: 'OK' });
    expect(t.Out.CurrentAttributes).toHaveLength(2);
  });

  it('normalizes a sparse trace', () => {
    const t = normalizeTrace({});
    expect(t.In).toEqual({ Deliveries: [], ItemText: null, ItemFormat: null, RawFileName: null, RawCreatedUtc: null, RawProcessedUtc: null, RawStoredTransactionCount: null, LateArrival: false });
    expect(t.Tagging.LayersDiffer).toBe(false);
    expect(t.Tagging.Published).toEqual({ Tag: '', Nickname: null, CertaintyLevel: null, DefinitionId: null, LibraryStatus: null, LibraryVersion: null, IsUntagged: false, IsDeadEnd: false, IsMultiTag: false, OtherTags: [], Attributes: [] });
    expect(t.Kb.Published.Status).toBe('NotEligible');
    expect(t.Kb.Published.Alternatives).toBe(0);
    expect(t.Out).toEqual({ Calls: [], CurrentTag: null, CurrentAttributes: [], DeletedAtBwatech: false });
    expect(normalizeTrace({ In: { ItemFormat: 'xml' } }).In.ItemFormat).toBeNull();
  });

  it('reads what each call was about, stringifying a numeric StatementId and defaulting absent fields', () => {
    const t = normalizeTrace({
      In: { Deliveries: [{ LogId: 'log-1', StatementId: 129915638, DataSetType: 'INTERIM_TransactionsList', BankSwiftCode: 'ARNBSARI', IBANs: ['SA31'], BusinessDate: '2026-10-16' }] },
      Kb: { Calls: [{ LogId: 'log-2' }] },
    });
    expect(t.In.Deliveries[0]).toMatchObject({ StatementId: '129915638', DataSetType: 'INTERIM_TransactionsList', BankSwiftCode: 'ARNBSARI', IBANs: ['SA31'], BusinessDate: '2026-10-16' });
    expect(t.Kb.Calls[0]).toMatchObject({ StatementId: '', DataSetType: null, BankSwiftCode: null, IBANs: [], BusinessDate: null });
  });
});
