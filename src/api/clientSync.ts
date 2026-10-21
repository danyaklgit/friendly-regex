import type { TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';
import { TEP_BASE, asRecord, numberOrZero, stringOrEmpty } from './taggingReportsShared';

/**
 * Client Sync read-only clients (spec section 4). Three POSTs to the TEP base
 * every other client uses. Normalizers accept any JSON: counts through
 * numberOrZero, missing arrays to [], missing strings to '' or null as typed,
 * unknown enum values to the documented fallbacks, extra fields ignored.
 * Route version: the backend document writes /api/v1.0/TEP; every existing
 * call uses /api/v1/TEP, which is assumed here until the backend confirms.
 */

export type ClientSyncLayer = 'ALL' | 'INTRADAY' | 'CONFIRMED';
export const CLIENT_SYNC_LAYERS: readonly ClientSyncLayer[] = ['ALL', 'INTRADAY', 'CONFIRMED'];
export type ClientSyncShow = 'ALL' | 'UNTAGGED' | 'LAYERS_DIFFER' | 'KB_PROMOTED' | 'KB_NOT_KNOWN' | 'KB_PENDING' | 'OUT_FAILED' | 'NOT_SENT';
export const CLIENT_SYNC_SHOWS: readonly ClientSyncShow[] = ['ALL', 'UNTAGGED', 'LAYERS_DIFFER', 'KB_PROMOTED', 'KB_NOT_KNOWN', 'KB_PENDING', 'OUT_FAILED', 'NOT_SENT'];
export type KbStatus = 'Promoted' | 'NotKnown' | 'Pending' | 'NotEligible';
export const KB_STATUSES: readonly KbStatus[] = ['Promoted', 'NotKnown', 'Pending', 'NotEligible'];
export type OutStatus = 'SENT' | 'UPDATED' | 'FAILED' | 'NOT_SENT' | 'NOT_SENT_BY_DESIGN' | 'DELETED' | 'UNTRACKED' | 'NEVER';
export const OUT_STATUSES: readonly OutStatus[] = ['SENT', 'UPDATED', 'FAILED', 'NOT_SENT', 'NOT_SENT_BY_DESIGN', 'DELETED', 'UNTRACKED', 'NEVER'];
export type AccountState = 'OK' | 'ATTENTION' | 'IDLE';
export const ACCOUNT_STATES: readonly AccountState[] = ['OK', 'ATTENTION', 'IDLE'];
export type WarningLevel = 'WARNING' | 'INFO';
export const WARNING_LEVELS: readonly WarningLevel[] = ['WARNING', 'INFO'];
export type ItemFormat = 'json' | 'swift';
const ITEM_FORMATS: readonly ItemFormat[] = ['json', 'swift'];

/** The list's side filter; 'ALL' sends no Side. */
export type ClientSyncSide = 'ALL' | 'CR' | 'DR';
export const CLIENT_SYNC_SIDES: readonly ClientSyncSide[] = ['ALL', 'CR', 'DR'];
/** The Tags value that keeps rows with no tag (backend contract). */
export const UNTAGGED_TAG_FILTER = 'UNTAGGED';

export function isClientSyncLayer(value: unknown): value is ClientSyncLayer {
  return typeof value === 'string' && (CLIENT_SYNC_LAYERS as readonly string[]).includes(value);
}
export function isClientSyncShow(value: unknown): value is ClientSyncShow {
  return typeof value === 'string' && (CLIENT_SYNC_SHOWS as readonly string[]).includes(value);
}

export interface ClientSyncScope {
  /** Omitted only when IBANs alone define the scope. */
  OrgId?: string;
  /** Omitted when empty. */
  IBANs?: string[];
  /** yyyy-MM-dd, inclusive. */
  FromDate: string;
  /** yyyy-MM-dd, inclusive, at most 30 days after FromDate. */
  ToDate: string;
  /** Always sent. */
  Layer: ClientSyncLayer;
}
export interface ClientSyncTransactionsRequest extends ClientSyncScope {
  Show: ClientSyncShow;
  /** Omitted from the body when blank. */
  Search?: string;
  /** 'CR' or 'DR'; omitted from the body for both sides. Matched ignoring case. */
  Side?: 'CR' | 'DR';
  /** Published tag names, matching ANY; UNTAGGED_TAG_FILTER keeps untagged rows. Omitted from the body when empty. */
  Tags?: string[];
  /** kb_customer_type values to keep (any, case-insensitive). Omitted from the body when empty. */
  KbCustomerTypes?: string[];
  /** Certainty ranks to keep (any); folds both KB vocabularies. Omitted from the body when empty. */
  KbCertaintyRanks?: number[];
  /** 1-based. */
  PageIndex: number;
  /** Default 100, maximum 2000. */
  PageSize: number;
}
export interface ClientSyncTraceRequest { TransactionId: string }

export interface KeyCount { Key: string; Count: number }
export interface KeyValue { Key: string; Value: string | null }
export interface CertaintyCount { Rank: number; Label: string; Count: number; ReceivedAs: string[] }

export interface ClientSyncInSummary {
  Deliveries: number; Accepted: number; Duplicates: number; Rejected: number; TransactionsRead: number;
  ByDataSetType: KeyCount[]; LastDeliveryUtc: string | null;
}
export interface ClientSyncTaggingSummary {
  Transactions: number; Tagged: number; Untagged: number; DeadEnds: number; LayersDiffer: number;
  MissingMandatoryAttributes: number; ByTag: KeyCount[];
}
export interface ClientSyncKbSummaryStats {
  Active: boolean; Eligible: number; Promoted: number; NotKnown: number; Pending: number;
  ByCertainty: CertaintyCount[];
  /** kb_customer_type values present, most frequent first. */
  ByCustomerType: KeyCount[];
  Calls: number; FailedCalls: number; MedianCallMs: number | null; LastCallUtc: string | null;
}
export interface ClientSyncOutSummaryStats {
  Calls: number; Pushes: number; PushesFailed: number; Patches: number; PatchesFailed: number;
  RowsSent: number; RowsNotSent: number; RowsNotSentByDesign: number; RowsLastCallFailed: number;
  MedianReceiptToPushMs: number | null; LastCallUtc: string | null;
}
export interface ClientSyncAccount {
  IBAN: string; BankSwiftCode: string; AccountName: string; DataSetTypes: string[];
  Deliveries: number; LastDeliveryUtc: string | null; Transactions: number; Untagged: number;
  KbEnabled: boolean; KbPromoted: number; KbPending: number; OutFailures: number; RowsNotSent: number;
  MedianReceiptToPushMs: number | null; State: AccountState;
}
export interface ClientSyncWarning {
  Level: WarningLevel; Code: string; IBAN: string | null; Count: number | null; Message: string; Show: ClientSyncShow | null;
}
export interface ClientSyncSummary {
  OrgId: string; ClientName: string; FromDate: string; ToDate: string; Layer: ClientSyncLayer; GeneratedAtUtc: string;
  In: ClientSyncInSummary; Tagging: ClientSyncTaggingSummary; KnowledgeBase: ClientSyncKbSummaryStats; Out: ClientSyncOutSummaryStats;
  Accounts: ClientSyncAccount[]; Warnings: ClientSyncWarning[];
}

export interface ClientSyncKbSummary {
  Status: KbStatus; Certainty: string; CertaintyRank: number; CustomerCode: string | null; CustomerNameEn: string | null;
  /** kb_customer_type as received (TC / CC); null for an unrecorded customer or no answer. Not CustomerType (kb_displayed_customer_type). */
  KbCustomerType: string | null;
}
export interface ClientSyncOutSummary {
  Status: OutStatus; LastCallUtc: string | null; LastError: string | null; ReceiptToPushMs: number | null;
}
export interface ClientSyncTransaction {
  Id: string; ReceivedAtUtc: string | null; DataSetType: string; IsConfirmed: boolean; IsArchived: boolean;
  BusinessDate: string; IBAN: string; BankSwiftCode: string; StatementId: string; Sequence: number | null;
  Side: string; Amount: number; CurrencyCode: string;
  Sender: string; Narrative: string; BankReference: string;
  Tag: string; OpsTag: string; IsUntagged: boolean; IsDeadEnd: boolean; LayersDiffer: boolean;
  AttributeCount: number; MissingMandatoryAttributes: number;
  Kb: ClientSyncKbSummary; Out: ClientSyncOutSummary;
  /** The published tag's attributes as extracted, in the rule's order; empty values included. */
  Attributes: TraceAttribute[];
  /** The knowledge base's answer as received (kb_* keys); empty when the row was never promoted. */
  KbAttributes: KeyValue[];
  /** The row's attributes exactly as TEP sends them to BwaTech now ("What BwaTech holds now"); the export reads these. */
  WireAttributes: KeyValue[];
}
export interface ClientSyncTransactionsPage {
  Transactions: ClientSyncTransaction[]; TotalCount: number; ShowCounts: KeyCount[]; PageIndex: number; PageSize: number;
  /** Export attribute column keys in BwaTech's order, computed over the whole filtered list (same on every page). */
  AttributeColumns: string[];
}

export interface ClientSyncCall {
  LogId: string; Endpoint: string; Operation: string; CallStartUtc: string; DurationMs: number | null;
  StatusType: string | null; StatusCode: string | null; StatusDescription: string | null; Succeeded: boolean;
  RecordCount: number | null; HasRequestFile: boolean; HasResponseFile: boolean; RerunOfId: string | null;
  /** Empty when the call has none (knowledge-base calls, patches). */
  StatementId: string;
  /** Canonical feed spelling (TEP normalises on arrival; the raw request may differ). */
  DataSetType: string | null; BankSwiftCode: string | null; IBANs: string[];
  /** Saudi business day, yyyy-MM-dd; null when the call spans several days. */
  BusinessDate: string | null;
}
export interface ClientSyncKbCall extends ClientSyncCall {
  RecordIds: string[]; RequestRecordJson: string | null;
  /** null = the knowledge base did not know the payer. */
  ResponseRecordJson: string | null;
}
export interface ClientSyncOutCall extends ClientSyncCall {
  ElementJson: string | null; ResponseText: string | null;
}
export interface TraceAttribute { Key: string; Value: string | null; IsMandatory: boolean; IsValid: boolean }
export interface ClientSyncTagState {
  Tag: string; Nickname: string | null; CertaintyLevel: string | null; DefinitionId: string | null;
  LibraryStatus: string | null; LibraryVersion: number | null; IsUntagged: boolean; IsDeadEnd: boolean; IsMultiTag: boolean;
  OtherTags: string[]; Attributes: TraceAttribute[];
}
export interface ClientSyncKbState {
  Status: KbStatus; Certainty: string; CertaintyRank: number; CustomerCode: string | null; CustomerNameEn: string | null;
  CustomerNameAr: string | null; CustomerLevel: string | null; CustomerType: string | null; Alternatives: number;
  /** kb_customer_type as received (TC / CC); null for an unrecorded customer or no answer. */
  KbCustomerType: string | null;
}
export interface ClientSyncTraceIn {
  Deliveries: ClientSyncCall[]; ItemText: string | null; ItemFormat: ItemFormat | null;
  RawFileName: string | null; RawCreatedUtc: string | null; RawProcessedUtc: string | null;
  RawStoredTransactionCount: number | null; LateArrival: boolean;
}
export interface ClientSyncTraceTagging { Published: ClientSyncTagState; Operator: ClientSyncTagState; LayersDiffer: boolean }
export interface ClientSyncTraceKb {
  Published: ClientSyncKbState; Operator: ClientSyncKbState; PublishedAttributes: KeyValue[]; Calls: ClientSyncKbCall[];
}
/** A held attribute with the layout's label for its key; Label is null for a key the layout does not know. */
export interface LabeledKeyValue { Key: string; Value: string | null; Label: string | null }
/** The customer the knowledge base displays (the kb_displayed_* keys). */
export interface ClientSyncDisplayedCustomer {
  Code: string | null; NameEn: string | null; NameAr: string | null; HierarchyLevel: string | null; CustomerType: string | null;
  /** Which match and party carries the displayed customer's code; null when none does. */
  MatchNumber: number | null; MatchLevel: string | null;
  Attributes: LabeledKeyValue[];
}
/** One party of a knowledge-base match (franchise, head office, outlet, unrecorded customer, or a new level). */
export interface ClientSyncMatchParty {
  Level: string; Title: string; Code: string | null; NameEn: string | null; NameAr: string | null;
  /** Unrecorded customers only. */
  CustomerType: string | null;
  IsDisplayed: boolean; Attributes: LabeledKeyValue[];
}
/** One knowledge-base match: the keys without a suffix are match 0, the _2 keys match 2, and so on. */
export interface ClientSyncKbMatch {
  Number: number; Suffix: string; CustomerType: string | null; Certainty: string; CertaintyRank: number;
  /** Ordered top-down by the backend: FRANCHISE, HO, OUTLET, any new level, UNRECORDED. */
  Parties: ClientSyncMatchParty[];
  /** The match's keys no party owns (kb_customer_type, kb_allocation_certainty, unknown keys). */
  Fields: LabeledKeyValue[];
}
/** "What BwaTech holds now" grouped by meaning; every CurrentAttributes entry lands in exactly one list. */
export interface ClientSyncCurrentView {
  Tep: KeyValue[];
  Displayed: ClientSyncDisplayedCustomer | null;
  Matches: ClientSyncKbMatch[];
}
export interface ClientSyncTraceOut {
  Calls: ClientSyncOutCall[]; CurrentTag: string | null; CurrentAttributes: KeyValue[]; DeletedAtBwatech: boolean;
  /** null when the backend predates the grouped view: the UI then shows the flat list only. */
  CurrentView: ClientSyncCurrentView | null;
}
export interface ClientSyncTrace {
  Transaction: ClientSyncTransaction; In: ClientSyncTraceIn; Tagging: ClientSyncTraceTagging; Kb: ClientSyncTraceKb; Out: ClientSyncTraceOut;
}

/* ---------- normalizer helpers ---------- */

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
/** A blank string reads as absent, so a chip never renders empty. */
function nonBlankOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
/** Ids and codes may arrive as numbers; keep them as strings. */
function scalarString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
function scalarStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}
function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function boolOrFalse(value: unknown): boolean {
  return value === true;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}
function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
function keyCounts(value: unknown): KeyCount[] {
  return recordArray(value).map((r) => ({ Key: stringOrEmpty(r.Key), Count: numberOrZero(r.Count) }));
}
function keyValues(value: unknown): KeyValue[] {
  return recordArray(value).map((r) => ({ Key: stringOrEmpty(r.Key), Value: stringOrNull(r.Value) }));
}
function traceAttributes(value: unknown): TraceAttribute[] {
  return recordArray(value).map((a) => ({
    Key: stringOrEmpty(a.Key),
    Value: stringOrNull(a.Value),
    IsMandatory: boolOrFalse(a.IsMandatory),
    // An attribute is valid unless the backend flags it.
    IsValid: a.IsValid !== false,
  }));
}
function itemFormat(value: unknown): ItemFormat | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return (ITEM_FORMATS as readonly string[]).includes(lower) ? (lower as ItemFormat) : null;
}

/* ---------- normalizers ---------- */

function normalizeKbSummary(raw: unknown): ClientSyncKbSummary {
  const r = asRecord(raw);
  return {
    Status: oneOf(r.Status, KB_STATUSES, 'NotEligible'),
    Certainty: stringOrEmpty(r.Certainty),
    CertaintyRank: numberOrZero(r.CertaintyRank),
    CustomerCode: scalarStringOrNull(r.CustomerCode),
    CustomerNameEn: stringOrNull(r.CustomerNameEn),
    KbCustomerType: nonBlankOrNull(r.KbCustomerType),
  };
}
function normalizeOutSummary(raw: unknown): ClientSyncOutSummary {
  const r = asRecord(raw);
  return {
    Status: oneOf(r.Status, OUT_STATUSES, 'UNTRACKED'),
    LastCallUtc: stringOrNull(r.LastCallUtc),
    LastError: stringOrNull(r.LastError),
    ReceiptToPushMs: numberOrNull(r.ReceiptToPushMs),
  };
}

export function normalizeTransaction(raw: unknown): ClientSyncTransaction {
  const r = asRecord(raw);
  return {
    Id: scalarString(r.Id),
    ReceivedAtUtc: stringOrNull(r.ReceivedAtUtc),
    DataSetType: stringOrEmpty(r.DataSetType),
    IsConfirmed: boolOrFalse(r.IsConfirmed),
    IsArchived: boolOrFalse(r.IsArchived),
    BusinessDate: stringOrEmpty(r.BusinessDate),
    IBAN: stringOrEmpty(r.IBAN),
    BankSwiftCode: stringOrEmpty(r.BankSwiftCode),
    StatementId: scalarString(r.StatementId),
    Sequence: numberOrNull(r.Sequence),
    Side: stringOrEmpty(r.Side),
    Amount: numberOrZero(r.Amount),
    CurrencyCode: stringOrEmpty(r.CurrencyCode),
    Sender: stringOrEmpty(r.Sender),
    Narrative: stringOrEmpty(r.Narrative),
    BankReference: stringOrEmpty(r.BankReference),
    Tag: stringOrEmpty(r.Tag),
    OpsTag: stringOrEmpty(r.OpsTag),
    IsUntagged: boolOrFalse(r.IsUntagged),
    IsDeadEnd: boolOrFalse(r.IsDeadEnd),
    LayersDiffer: boolOrFalse(r.LayersDiffer),
    AttributeCount: numberOrZero(r.AttributeCount),
    MissingMandatoryAttributes: numberOrZero(r.MissingMandatoryAttributes),
    Kb: normalizeKbSummary(r.Kb),
    Out: normalizeOutSummary(r.Out),
    Attributes: traceAttributes(r.Attributes),
    KbAttributes: keyValues(r.KbAttributes),
    WireAttributes: keyValues(r.WireAttributes),
  };
}

function normalizeAccount(raw: Record<string, unknown>): ClientSyncAccount {
  return {
    IBAN: stringOrEmpty(raw.IBAN),
    BankSwiftCode: stringOrEmpty(raw.BankSwiftCode),
    AccountName: stringOrEmpty(raw.AccountName),
    DataSetTypes: stringArray(raw.DataSetTypes),
    Deliveries: numberOrZero(raw.Deliveries),
    LastDeliveryUtc: stringOrNull(raw.LastDeliveryUtc),
    Transactions: numberOrZero(raw.Transactions),
    Untagged: numberOrZero(raw.Untagged),
    KbEnabled: boolOrFalse(raw.KbEnabled),
    KbPromoted: numberOrZero(raw.KbPromoted),
    KbPending: numberOrZero(raw.KbPending),
    OutFailures: numberOrZero(raw.OutFailures),
    RowsNotSent: numberOrZero(raw.RowsNotSent),
    MedianReceiptToPushMs: numberOrNull(raw.MedianReceiptToPushMs),
    State: oneOf(raw.State, ACCOUNT_STATES, 'IDLE'),
  };
}
function normalizeWarning(raw: Record<string, unknown>): ClientSyncWarning {
  return {
    Level: oneOf(raw.Level, WARNING_LEVELS, 'INFO'),
    Code: stringOrEmpty(raw.Code),
    IBAN: stringOrNull(raw.IBAN),
    Count: numberOrNull(raw.Count),
    Message: stringOrEmpty(raw.Message),
    Show: isClientSyncShow(raw.Show) ? raw.Show : null,
  };
}

export function normalizeSummary(raw: unknown): ClientSyncSummary {
  const r = asRecord(raw);
  const i = asRecord(r.In);
  const t = asRecord(r.Tagging);
  const k = asRecord(r.KnowledgeBase);
  const o = asRecord(r.Out);
  return {
    OrgId: stringOrEmpty(r.OrgId),
    ClientName: stringOrEmpty(r.ClientName),
    FromDate: stringOrEmpty(r.FromDate),
    ToDate: stringOrEmpty(r.ToDate),
    Layer: oneOf(r.Layer, CLIENT_SYNC_LAYERS, 'ALL'),
    GeneratedAtUtc: stringOrEmpty(r.GeneratedAtUtc),
    In: {
      Deliveries: numberOrZero(i.Deliveries), Accepted: numberOrZero(i.Accepted), Duplicates: numberOrZero(i.Duplicates),
      Rejected: numberOrZero(i.Rejected), TransactionsRead: numberOrZero(i.TransactionsRead),
      ByDataSetType: keyCounts(i.ByDataSetType), LastDeliveryUtc: stringOrNull(i.LastDeliveryUtc),
    },
    Tagging: {
      Transactions: numberOrZero(t.Transactions), Tagged: numberOrZero(t.Tagged), Untagged: numberOrZero(t.Untagged),
      DeadEnds: numberOrZero(t.DeadEnds), LayersDiffer: numberOrZero(t.LayersDiffer),
      MissingMandatoryAttributes: numberOrZero(t.MissingMandatoryAttributes), ByTag: keyCounts(t.ByTag),
    },
    KnowledgeBase: {
      // Dims the card only on an explicit false (a backend without the flag reads as active).
      Active: k.Active !== false,
      Eligible: numberOrZero(k.Eligible), Promoted: numberOrZero(k.Promoted), NotKnown: numberOrZero(k.NotKnown), Pending: numberOrZero(k.Pending),
      ByCertainty: recordArray(k.ByCertainty).map((c) => ({
        Rank: numberOrZero(c.Rank), Label: stringOrEmpty(c.Label), Count: numberOrZero(c.Count), ReceivedAs: stringArray(c.ReceivedAs),
      })),
      ByCustomerType: keyCounts(k.ByCustomerType).filter((c) => c.Key !== ''),
      Calls: numberOrZero(k.Calls), FailedCalls: numberOrZero(k.FailedCalls),
      MedianCallMs: numberOrNull(k.MedianCallMs), LastCallUtc: stringOrNull(k.LastCallUtc),
    },
    Out: {
      Calls: numberOrZero(o.Calls), Pushes: numberOrZero(o.Pushes), PushesFailed: numberOrZero(o.PushesFailed),
      Patches: numberOrZero(o.Patches), PatchesFailed: numberOrZero(o.PatchesFailed),
      RowsSent: numberOrZero(o.RowsSent), RowsNotSent: numberOrZero(o.RowsNotSent), RowsNotSentByDesign: numberOrZero(o.RowsNotSentByDesign),
      RowsLastCallFailed: numberOrZero(o.RowsLastCallFailed),
      MedianReceiptToPushMs: numberOrNull(o.MedianReceiptToPushMs), LastCallUtc: stringOrNull(o.LastCallUtc),
    },
    Accounts: recordArray(r.Accounts).map(normalizeAccount),
    Warnings: recordArray(r.Warnings).map(normalizeWarning),
  };
}

export function normalizeTransactionsPage(raw: unknown, request: ClientSyncTransactionsRequest): ClientSyncTransactionsPage {
  const root = asRecord(raw);
  // The document names no wrapper for the page: read the root, else a Page key.
  const r = Array.isArray(root.Transactions) ? root : asRecord(root.Page);
  const transactions = recordArray(r.Transactions).map(normalizeTransaction);
  return {
    Transactions: transactions,
    TotalCount: r.TotalCount === undefined ? transactions.length : numberOrZero(r.TotalCount),
    ShowCounts: keyCounts(r.ShowCounts),
    PageIndex: r.PageIndex === undefined ? request.PageIndex : numberOrZero(r.PageIndex),
    PageSize: r.PageSize === undefined ? request.PageSize : numberOrZero(r.PageSize),
    AttributeColumns: stringArray(r.AttributeColumns).filter((k) => k !== ''),
  };
}

function normalizeCall(raw: Record<string, unknown>): ClientSyncCall {
  return {
    LogId: scalarString(raw.LogId),
    Endpoint: stringOrEmpty(raw.Endpoint),
    Operation: stringOrEmpty(raw.Operation),
    CallStartUtc: stringOrEmpty(raw.CallStartUtc),
    DurationMs: numberOrNull(raw.DurationMs),
    StatusType: stringOrNull(raw.StatusType),
    StatusCode: scalarStringOrNull(raw.StatusCode),
    StatusDescription: stringOrNull(raw.StatusDescription),
    Succeeded: boolOrFalse(raw.Succeeded),
    RecordCount: numberOrNull(raw.RecordCount),
    HasRequestFile: boolOrFalse(raw.HasRequestFile),
    HasResponseFile: boolOrFalse(raw.HasResponseFile),
    RerunOfId: scalarStringOrNull(raw.RerunOfId),
    StatementId: scalarString(raw.StatementId),
    DataSetType: stringOrNull(raw.DataSetType),
    BankSwiftCode: stringOrNull(raw.BankSwiftCode),
    IBANs: stringArray(raw.IBANs),
    BusinessDate: stringOrNull(raw.BusinessDate),
  };
}
function normalizeKbCall(raw: Record<string, unknown>): ClientSyncKbCall {
  return {
    ...normalizeCall(raw),
    RecordIds: stringArray(raw.RecordIds),
    RequestRecordJson: stringOrNull(raw.RequestRecordJson),
    ResponseRecordJson: stringOrNull(raw.ResponseRecordJson),
  };
}
function normalizeOutCall(raw: Record<string, unknown>): ClientSyncOutCall {
  return {
    ...normalizeCall(raw),
    ElementJson: stringOrNull(raw.ElementJson),
    ResponseText: stringOrNull(raw.ResponseText),
  };
}
function normalizeTagState(raw: unknown): ClientSyncTagState {
  const r = asRecord(raw);
  return {
    Tag: stringOrEmpty(r.Tag),
    Nickname: stringOrNull(r.Nickname),
    CertaintyLevel: stringOrNull(r.CertaintyLevel),
    DefinitionId: scalarStringOrNull(r.DefinitionId),
    LibraryStatus: stringOrNull(r.LibraryStatus),
    LibraryVersion: numberOrNull(r.LibraryVersion),
    IsUntagged: boolOrFalse(r.IsUntagged),
    IsDeadEnd: boolOrFalse(r.IsDeadEnd),
    IsMultiTag: boolOrFalse(r.IsMultiTag),
    OtherTags: stringArray(r.OtherTags),
    Attributes: traceAttributes(r.Attributes),
  };
}
function normalizeKbState(raw: unknown): ClientSyncKbState {
  const r = asRecord(raw);
  return {
    Status: oneOf(r.Status, KB_STATUSES, 'NotEligible'),
    Certainty: stringOrEmpty(r.Certainty),
    CertaintyRank: numberOrZero(r.CertaintyRank),
    CustomerCode: scalarStringOrNull(r.CustomerCode),
    CustomerNameEn: stringOrNull(r.CustomerNameEn),
    CustomerNameAr: stringOrNull(r.CustomerNameAr),
    CustomerLevel: stringOrNull(r.CustomerLevel),
    CustomerType: stringOrNull(r.CustomerType),
    Alternatives: numberOrZero(r.Alternatives),
    KbCustomerType: nonBlankOrNull(r.KbCustomerType),
  };
}

function labeledKeyValues(value: unknown): LabeledKeyValue[] {
  return recordArray(value).map((r) => ({ Key: stringOrEmpty(r.Key), Value: stringOrNull(r.Value), Label: nonBlankOrNull(r.Label) }));
}
function normalizeMatchParty(raw: Record<string, unknown>): ClientSyncMatchParty {
  const level = stringOrEmpty(raw.Level);
  return {
    Level: level,
    Title: nonBlankOrNull(raw.Title) ?? level,
    Code: scalarStringOrNull(raw.Code),
    NameEn: stringOrNull(raw.NameEn),
    NameAr: stringOrNull(raw.NameAr),
    CustomerType: nonBlankOrNull(raw.CustomerType),
    IsDisplayed: boolOrFalse(raw.IsDisplayed),
    Attributes: labeledKeyValues(raw.Attributes),
  };
}
function normalizeKbMatch(raw: Record<string, unknown>): ClientSyncKbMatch {
  return {
    Number: numberOrZero(raw.Number),
    Suffix: stringOrEmpty(raw.Suffix),
    CustomerType: nonBlankOrNull(raw.CustomerType),
    Certainty: stringOrEmpty(raw.Certainty),
    CertaintyRank: numberOrZero(raw.CertaintyRank),
    Parties: recordArray(raw.Parties).map(normalizeMatchParty),
    Fields: labeledKeyValues(raw.Fields),
  };
}
/** Absent or not an object reads as null (older backend); the UI then offers the flat list only. */
function normalizeCurrentView(raw: unknown): ClientSyncCurrentView | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = asRecord(raw);
  const d = r.Displayed !== null && typeof r.Displayed === 'object' ? asRecord(r.Displayed) : null;
  return {
    Tep: keyValues(r.Tep),
    Displayed: d && {
      Code: scalarStringOrNull(d.Code),
      NameEn: stringOrNull(d.NameEn),
      NameAr: stringOrNull(d.NameAr),
      HierarchyLevel: nonBlankOrNull(d.HierarchyLevel),
      CustomerType: nonBlankOrNull(d.CustomerType),
      MatchNumber: numberOrNull(d.MatchNumber),
      MatchLevel: nonBlankOrNull(d.MatchLevel),
      Attributes: labeledKeyValues(d.Attributes),
    },
    // The backend sorts by Number; sorting again is cheap insurance for the match-0-first rule.
    Matches: recordArray(r.Matches).map(normalizeKbMatch).sort((a, b) => a.Number - b.Number),
  };
}

export function normalizeTrace(raw: unknown): ClientSyncTrace {
  const r = asRecord(raw);
  const i = asRecord(r.In);
  const t = asRecord(r.Tagging);
  const k = asRecord(r.Kb);
  const o = asRecord(r.Out);
  return {
    Transaction: normalizeTransaction(r.Transaction),
    In: {
      Deliveries: recordArray(i.Deliveries).map(normalizeCall),
      ItemText: stringOrNull(i.ItemText),
      ItemFormat: itemFormat(i.ItemFormat),
      RawFileName: stringOrNull(i.RawFileName),
      RawCreatedUtc: stringOrNull(i.RawCreatedUtc),
      RawProcessedUtc: stringOrNull(i.RawProcessedUtc),
      RawStoredTransactionCount: numberOrNull(i.RawStoredTransactionCount),
      LateArrival: boolOrFalse(i.LateArrival),
    },
    Tagging: {
      Published: normalizeTagState(t.Published),
      Operator: normalizeTagState(t.Operator),
      LayersDiffer: boolOrFalse(t.LayersDiffer),
    },
    Kb: {
      Published: normalizeKbState(k.Published),
      Operator: normalizeKbState(k.Operator),
      PublishedAttributes: keyValues(k.PublishedAttributes),
      Calls: recordArray(k.Calls).map(normalizeKbCall),
    },
    Out: {
      Calls: recordArray(o.Calls).map(normalizeOutCall),
      CurrentTag: stringOrNull(o.CurrentTag),
      CurrentAttributes: keyValues(o.CurrentAttributes),
      DeletedAtBwatech: boolOrFalse(o.DeletedAtBwatech),
      CurrentView: normalizeCurrentView(o.CurrentView),
    },
  };
}

/* ---------- request bodies ---------- */

export function toSummaryBody(scope: ClientSyncScope): Record<string, unknown> {
  return {
    ...(scope.OrgId ? { OrgId: scope.OrgId } : {}),
    ...(scope.IBANs && scope.IBANs.length > 0 ? { IBANs: [...scope.IBANs] } : {}),
    FromDate: scope.FromDate,
    ToDate: scope.ToDate,
    Layer: scope.Layer,
  };
}

export function toTransactionsBody(request: ClientSyncTransactionsRequest): Record<string, unknown> {
  const search = (request.Search ?? '').trim();
  return {
    ...toSummaryBody(request),
    Show: request.Show,
    ...(search ? { Search: search } : {}),
    ...(request.Side ? { Side: request.Side } : {}),
    ...(request.Tags && request.Tags.length > 0 ? { Tags: [...request.Tags] } : {}),
    ...(request.KbCustomerTypes && request.KbCustomerTypes.length > 0 ? { KbCustomerTypes: [...request.KbCustomerTypes] } : {}),
    ...(request.KbCertaintyRanks && request.KbCertaintyRanks.length > 0 ? { KbCertaintyRanks: [...request.KbCertaintyRanks] } : {}),
    PageIndex: request.PageIndex,
    PageSize: request.PageSize,
  };
}

/* ---------- fetchers ---------- */

export async function getClientSyncSummary(
  scope: ClientSyncScope,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<ClientSyncSummary> {
  const res = await fetch(`${TEP_BASE}/GetClientSyncSummary`, {
    method: 'POST',
    headers: buildHeaders(authToken, tepHeaders, 'GetClientSyncSummary'),
    body: JSON.stringify(toSummaryBody(scope)),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load the client sync summary');
  const json: unknown = await res.json();
  return normalizeSummary(asRecord(json).Summary);
}

export async function getClientSyncTransactions(
  request: ClientSyncTransactionsRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<ClientSyncTransactionsPage> {
  const res = await fetch(`${TEP_BASE}/GetClientSyncTransactions`, {
    method: 'POST',
    headers: buildHeaders(authToken, tepHeaders, 'GetClientSyncTransactions'),
    body: JSON.stringify(toTransactionsBody(request)),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load the client sync transactions');
  const json: unknown = await res.json();
  return normalizeTransactionsPage(json, request);
}

export async function getClientSyncTrace(
  request: ClientSyncTraceRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<ClientSyncTrace> {
  const res = await fetch(`${TEP_BASE}/GetClientSyncTrace`, {
    method: 'POST',
    headers: buildHeaders(authToken, tepHeaders, 'GetClientSyncTrace'),
    body: JSON.stringify({ TransactionId: request.TransactionId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load the transaction trace');
  const json: unknown = await res.json();
  return normalizeTrace(asRecord(json).Trace);
}
