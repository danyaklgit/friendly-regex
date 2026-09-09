import type { TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';
import type { TagSpecDefinition } from '../types';

const BASE = '/api/tep/api/v1/TEP';

// --- Smart Sampling Engine (Curated View, backend 2026-09-03) --------------
// Five endpoints behind the curated view + rule suggestions. The curated
// filter itself is NOT an endpoint: it is one standard FilteringProperty
// ({ColumnName:'IsCuratedSample', Operand:'EQ', Value:'true'}) on the normal
// GetTEPTransactions read. Contracts: Docs/TxTEPAPI_API_Reference.md §6.5b.
// MT940-family workspaces only in v1 (no intraday, no Ledger).

export type SamplingRunStatus = 'Idle' | 'Running';

export interface SamplingState {
  Id: string;
  BankSwiftCode: string;
  Side: string;
  Status: SamplingRunStatus;
  WorkSets: number;
  Representatives: number;
  Suggestions: number;
  StartedAtUtc: string | null;
  CompletedAtUtc: string | null;
  LastSampleSetId: string | null;
  LastError: string | null;
}

export type SuggestionConfidence = 'HIGH' | 'MED' | 'LOW' | 'REVIEW' | 'UNUSABLE';
export type SuggestionMatchKind = 'Untagged' | 'MultiTag';
export type SuggestionMode = 'Create' | 'Extend';
export type SuggestionStatus = 'Pending' | 'Accepted' | 'Rejected';

// --- Matching keys (backend 2026-09-07) --------------------------------------
// The matching key is the narrative with changing parts replaced by typed
// placeholders. It is delivered as KeyTokens[] (chips) beside the legacy
// StructuralAnchor string — render from the tokens, never by parsing the
// string. Contracts: UI_CuratedView_MatchingKeys.md §3 / API Reference §6.5c.

/** AI = AdditionalInformation, D2 = Description2; D1 (Description1) and TD
 *  (TransactionDetails) joined 2026-09-08 as fallback fields — rows whose AI
 *  and D2 are both empty key on the MT940 :61:/:86: narrative instead of
 *  piling into one keyless UNUSABLE set. */
export type KeyTokenField = 'AI' | 'D2' | 'D1' | 'TD';
export type KeyTokenKind = 'Literal' | 'Placeholder' | 'List';

export interface KeyToken {
  Field: KeyTokenField;
  /** Literal = exact words; Placeholder = one of the nine built-ins
   *  (Text = name without brackets, e.g. "DATE"); List = a LOV list
   *  (Text = list tag, Item = the item for Keep-item lists). */
  Kind: KeyTokenKind;
  Text: string;
  Item?: string | null;
  /** Exactly-N-characters shapes (Curation Studio, 2026-09-08): the CHAR
   *  placeholder carries its width — `<CHAR[16]>`. */
  Length?: number | null;
  /** No space before this chip: render flush against the previous one
   *  (`ORD//` + `<NAME>` reads `ORD//<NAME>`). */
  Glued?: boolean;
}

export type VocabularyBehavior = 'Collapse' | 'KeepItem' | 'Off' | 'Never';

export interface VocabularyListInfo {
  ListTag: string;
  Behavior: VocabularyBehavior;
  Priority: number;
  MinKeyLength: number;
  ShortCodesInSlashPair: boolean;
  ActiveItems: number;
  /** Distinct names/aliases/codes long enough to match under MinKeyLength —
   *  a 0 explains "why does this list never mask?". */
  UsableKeys: number;
  /** Internal lists (ATTRIBUTES, EXTRACTIONS, …) never take part: read-only. */
  IsInternal: boolean;
  /** Nothing stored yet — the code default shows. */
  IsDefault: boolean;
}

/** How a field the key does not mention is treated: "Blank" = must be empty
 *  (kept from the source group), "Any" = the engine dropped the constraint
 *  while widening a small group, "Pattern" = the key's own tokens apply. */
export type KeyFieldMode = 'Blank' | 'Any' | 'Pattern';

export interface KeyEditPreview {
  EditedKey: string;
  AiMode: KeyFieldMode;
  D2Mode: KeyFieldMode;
  /** Fallback fields (2026-09-08), same three values and meaning. */
  D1Mode?: KeyFieldMode;
  TDMode?: KeyFieldMode;
  /** Decided by the engine from the rows being edited, never set by the
   *  operator (2026-09-08): true = the key sits at the start of its field
   *  ("Starts with"), false = it may appear anywhere ("Contains"). */
  Anchored?: boolean;
  /** Open rows (untagged/multi-tag, not dead-end) the edited key matches. */
  MatchCount: number;
  WorkRows: number;
  /** Where those rows sit today: source group first, then by size. */
  Groups: { SimilarSetId: string; Anchor: string; Count: number; IsSource: boolean }[];
  /** Rows the edit would ADD come first. */
  ExampleTexts: string[];
  Warnings: string[];
}

export interface KeyOverride {
  Id: string;
  BankSwiftCode: string;
  Side: string;
  SourceSimilarSetId: string;
  SourceAnchor: string;
  Tokens: KeyToken[];
  EditedKey: string;
  AiMode: KeyFieldMode;
  D2Mode: KeyFieldMode;
  D1Mode?: KeyFieldMode;
  TDMode?: KeyFieldMode;
  /** Stored from the preview's engine decision and reused by every run. */
  Anchored?: boolean;
  CreatedByUserId: string;
  CreatedAtUtc: string;
  Note?: string | null;
  // Curation Studio (2026-09-08): a saved curation IS a KeyOverride with
  // these extras.
  Name?: string | null;
  SourceTransactionId?: string | null;
  UpdatedAtUtc?: string | null;
  UpdatedByUserId?: string | null;
}

export interface SuggestedTagSpec {
  /** Suggestion document id — the `SuggestionId` Accept/Reject take. */
  Id: string;
  /** Similar-set group key. Curated rows carry the same value in their
   *  `SimilarSetId` field — the join between a work row and its suggestion. */
  SimilarSetId: string;
  MatchKind: SuggestionMatchKind;
  Mode: SuggestionMode;
  Confidence: SuggestionConfidence;
  Warnings: string[] | null;
  /** How many backlog transactions this suggestion's set covers. */
  CoverageCount: number;
  StructuralAnchor: string | null;
  ExampleTexts: string[] | null;
  ExampleTransactionIds: string[] | null;
  /** A real TagSpecDefinition draft (Tag null for novel sets, Nickname
   *  prefilled, no Srv* stamps) — maps 1:1 onto the wizard form state. */
  SuggestedDefinition: TagSpecDefinition | null;
  /** Extend mode: the existing tag whose neighbours already cover this set. */
  BaseTag?: string | null;
  NeighborPurity?: number | null;
  /** MultiTag sets: the tags that conflict on these rows (no draft). */
  ConflictingTags?: string[] | null;
  Status: SuggestionStatus;
  /** The matching key as chips — the render source (never parse the anchor). */
  KeyTokens?: KeyToken[] | null;
  /** Set when an operator key edit produced this group's key. */
  KeyOverrideId?: string | null;
  /** A key's identity includes the transaction type (2026-09-08): two sets
   *  can share the same key TEXT and still be separate groups. Show these on
   *  the header/drawer — they're what tells such groups apart. */
  TransactionTypeCodes?: string[] | null;
  /** Curation Studio (2026-09-08): the operator-given name of the curation
   *  that produced this group's key — head the group by it when present. */
  CurationName?: string | null;
}

interface SfmEnvelope {
  SFM?: { Constant?: string | null; BackendTag?: string | null };
}

function sfmTag(json: SfmEnvelope): string {
  return json.SFM?.Constant ?? json.SFM?.BackendTag ?? '';
}

// --- Resample ---------------------------------------------------------------
// Operator "start fresh" for a workspace (both fields empty = every
// MT940-family partition). Day to day the backend resamples itself after
// ingest and after every rule save/retag; a run already live answers
// SFM_EXPORT_STILL_IN_PROGRESS (409-family) — surfaced as `alreadyRunning`,
// never thrown as an error.

export async function resample(
  req: { BankSwiftCode?: string; Side?: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ startedPartitions: string[]; alreadyRunning: boolean }> {
  const res = await fetch(`${BASE}/Resample`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'Resample'),
    body: JSON.stringify(req),
    signal,
  });
  if (res.status === 409) {
    const json = (await res.json().catch(() => ({}))) as SfmEnvelope;
    if (sfmTag(json).includes('STILL_IN_PROGRESS')) {
      return { startedPartitions: [], alreadyRunning: true };
    }
  }
  await throwIfNotOk(res, 'Failed to start resample');
  const json = (await res.json()) as SfmEnvelope & { StartedPartitions?: string[] };
  return {
    startedPartitions: json.StartedPartitions ?? [],
    // 200 + STILL_IN_PROGRESS = every requested partition already running.
    alreadyRunning: sfmTag(json).includes('STILL_IN_PROGRESS'),
  };
}

// --- GetSamplingStatus ------------------------------------------------------

export async function getSamplingStatus(
  req: { BankSwiftCode?: string; Side?: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<SamplingState[]> {
  const res = await fetch(`${BASE}/GetSamplingStatus`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetSamplingStatus'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch sampling status');
  const json = (await res.json()) as { States?: SamplingState[] };
  return json.States ?? [];
}

// --- GetSuggestedTagSpecs ---------------------------------------------------
// Pending only, largest CoverageCount first (server-ordered).

export async function getSuggestedTagSpecs(
  req: { BankSwiftCode?: string; Side?: string; SimilarSetId?: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<SuggestedTagSpec[]> {
  const res = await fetch(`${BASE}/GetSuggestedTagSpecs`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetSuggestedTagSpecs'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch rule suggestions');
  const json = (await res.json()) as { Suggestions?: SuggestedTagSpec[] };
  return json.Suggestions ?? [];
}

// --- AcceptSuggestion / RejectSuggestion ------------------------------------
// Accept marks the doc Accepted and returns it — the UI then opens the rule
// builder prefilled from SuggestedDefinition and saves through the NORMAL
// TagSpecLibrarySave. The engine itself never writes rules or tags.

export async function acceptSuggestion(
  suggestionId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<SuggestedTagSpec | null> {
  const res = await fetch(`${BASE}/AcceptSuggestion`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'AcceptSuggestion'),
    body: JSON.stringify({ SuggestionId: suggestionId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to accept the suggestion');
  const json = (await res.json()) as { Suggestion?: SuggestedTagSpec | null };
  return json.Suggestion ?? null;
}

export async function rejectSuggestion(
  suggestionId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/RejectSuggestion`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'RejectSuggestion'),
    body: JSON.stringify({ SuggestionId: suggestionId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to reject the suggestion');
}

// --- Sampling vocabulary ------------------------------------------------------
// Which LOV lists take part in key masking and how (Collapse / KeepItem / Off;
// Never for internal lists). Saves take effect at the NEXT sampling run.

export async function getSamplingVocabulary(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<VocabularyListInfo[]> {
  const res = await fetch(`${BASE}/GetSamplingVocabulary`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetSamplingVocabulary'),
    body: JSON.stringify({}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch the sampling vocabulary');
  const json = (await res.json()) as { Lists?: VocabularyListInfo[] };
  return json.Lists ?? [];
}

export async function saveSamplingVocabulary(
  lists: Pick<VocabularyListInfo, 'ListTag' | 'Behavior' | 'Priority' | 'MinKeyLength' | 'ShortCodesInSlashPair'>[],
  userId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<VocabularyListInfo[]> {
  const res = await fetch(`${BASE}/SaveSamplingVocabulary`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveSamplingVocabulary'),
    body: JSON.stringify({ Lists: lists, UserId: userId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save the sampling vocabulary');
  const json = (await res.json()) as { Lists?: VocabularyListInfo[] };
  return json.Lists ?? [];
}

// --- Key edits ----------------------------------------------------------------
// Operators correct a group's matching key; the engine regroups the workspace
// (a run REPLACES its groups — SimilarSetIds change) and the correction
// survives every later resample until deleted. Per workspace (bank + side).

/** Preview result, or `invalidKey` when the key pins nothing (no literal with
 *  3+ meaningful characters and no list value) — disable Apply, don't error. */
export type KeyEditPreviewResult =
  | { preview: KeyEditPreview; invalidKey: false }
  | { preview: null; invalidKey: true };

export async function previewKeyEdit(
  req: { BankSwiftCode: string; Side: string; SourceSimilarSetId: string; Tokens: KeyToken[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<KeyEditPreviewResult> {
  const res = await fetch(`${BASE}/PreviewKeyEdit`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'PreviewKeyEdit'),
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const json = (await res.clone().json().catch(() => ({}))) as SfmEnvelope;
    if (sfmTag(json).includes('INVALID_INPUT')) return { preview: null, invalidKey: true };
    await throwIfNotOk(res, 'Failed to preview the key edit');
  }
  const json = (await res.json()) as SfmEnvelope & { Preview?: KeyEditPreview };
  if (sfmTag(json).includes('INVALID_INPUT') || !json.Preview) return { preview: null, invalidKey: true };
  return { preview: json.Preview, invalidKey: false };
}

export async function saveKeyEdit(
  req: {
    BankSwiftCode: string;
    Side: string;
    SourceSimilarSetId: string;
    SourceAnchor: string;
    Tokens: KeyToken[];
    Note?: string;
    UserId: string;
  },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ override: KeyOverride | null; runStarted: boolean }> {
  const res = await fetch(`${BASE}/SaveKeyEdit`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveKeyEdit'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save the key edit');
  const json = (await res.json()) as { Override?: KeyOverride | null; RunStarted?: boolean };
  // RunStarted false = a run was already live; the edit is applied by the
  // next one — the caller still polls the same way.
  return { override: json.Override ?? null, runStarted: json.RunStarted ?? false };
}

export async function deleteKeyEdit(
  keyOverrideId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ runStarted: boolean }> {
  const res = await fetch(`${BASE}/DeleteKeyEdit`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteKeyEdit'),
    body: JSON.stringify({ KeyOverrideId: keyOverrideId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete the key edit');
  const json = (await res.json()) as { RunStarted?: boolean };
  return { runStarted: json.RunStarted ?? false };
}

// --- Curation Studio (2026-09-08) ---------------------------------------------
// Operators build a curation FROM a transaction: pick the narrative fields,
// replace the changing parts with typed pills, watch the matching rows, save.
// A saved curation IS a KeyOverride, so the sampling run applies it unchanged.
// Contracts: UI_Curation_Studio.md §3 / API Reference §6.5d. Per workspace
// (bank + side), MT940 family only. Nothing here writes rules or tags.

export interface CurationSpan {
  /** Character offset into the field's Text. Spans cover the text completely
   *  and in order — render them, never re-tokenise the string. Inserted
   *  spans sit between them with Start -1 / Length 0. */
  Start: number;
  Length: number;
  Text: string;
  Token: KeyToken;
  /** Editing delta (2026-09-08): false = source text that is NOT part of the
   *  key — shown struck through, contributes nothing. Default true. */
  InKey?: boolean;
  /** Editing delta (2026-09-08): true = a key token that is nowhere in the
   *  source text (typed words, an added pill); Start -1, Length 0, Text is
   *  the typed words (empty for a pill). Default false. */
  Inserted?: boolean;
}

export interface CurationFieldInfo {
  Field: KeyTokenField;
  /** Transaction property name (AdditionalInformation, Description2, …). */
  Property: string;
  Label: string;
  Text: string | null;
  /** Pre-selected = the engine keys on this field. */
  Selected: boolean;
  Mode: KeyFieldMode;
  Spans: CurationSpan[];
}

/** Date-family pill kinds (formats delta, 2026-09-08): the format rides in
 *  the pill's Item — `<DATE:yyMMdd>`, `<TIME:HH:mm>`, `<DATETIME:yyyyMMddHHmm>`.
 *  No Item = the generic shape, exactly as before. Format letters are .NET's
 *  (`yyyy yy MM M dd d MMM HH H hh h mm m ss s tt`), `_` stands for one space,
 *  anything else is a literal. A format that does not compile is NOT rejected:
 *  the pill falls back to the generic shape and the preview warns. */
export type DateFormatKind = 'DATE' | 'TIME' | 'DATETIME';

export interface DateFormatInfo {
  Kind: DateFormatKind;
  Format: string;
  Label: string;
  /** Rendered from this transaction's own value date (e.g. "240306"). */
  Example: string;
}

export interface CurationPill {
  Kind: 'Placeholder' | 'List';
  Text: string;
  Item?: string | null;
  /** CHAR shapes: the exact width. */
  Length?: number | null;
  Label: string;
  Description?: string | null;
  /** "Detected" (the ladder found it in the text), "Shapes", "Lists". */
  Group: string;
  Behavior?: VocabularyBehavior | null;
  UsableKeys?: number | null;
}

export interface CurationPreview {
  /** false = the key pins nothing (counts are 0, Warnings says why) — Save
   *  must be disabled. */
  IsValid: boolean;
  Key: string;
  Anchored: boolean;
  Modes: Partial<Record<KeyTokenField, KeyFieldMode>>;
  /** The rule as the engine knows it, one regex per keyed field. */
  Patterns: { Field: KeyTokenField; Property: string; Mode: KeyFieldMode; Regex: string }[];
  /** Open rows (untagged/multi-tag, not dead-end) the key matches. */
  MatchCount: number;
  WorkRows: number;
  /** Null when no SourceTransactionId was sent. */
  SourceMatches: boolean | null;
  SourceFailingFields: string[];
  TransactionTypeCodes: { Key: string; Count: number }[];
  Groups: { SimilarSetId: string; Anchor: string; Count: number; IsSource: boolean }[];
  OverlappingCurations: { KeyOverrideId: string; Name: string | null; Key: string; Count: number }[];
  /** Rows ALREADY tagged that the key also matches — an existing rule may
   *  cover the shape. */
  TaggedMatchCount: number;
  TaggedTags: { Key: string; Count: number }[];
  ExampleTexts: string[];
  ExampleTransactionIds: string[];
  /** A GetTEPTransactions filter equivalent to the key — feed it to the grid,
   *  adding OpsIsUntagged EQ true for the open-rows tab. Passed through
   *  verbatim (the REGEX entry carries its own nested clauses). */
  Filters: unknown[];
  Warnings: string[];
}

export interface CurationDraft {
  KeyOverrideId?: string | null;
  SuggestionId?: string | null;
  SimilarSetId?: string | null;
  Name?: string | null;
  Note?: string | null;
  TransactionId: string;
  BankSwiftCode: string;
  Side: string;
  DataSetType: string;
  TransactionTypeCode?: string | null;
  SourceAnchor?: string | null;
  Fields: CurationFieldInfo[];
  /** The working key: the selected fields' spans in order. */
  Tokens: KeyToken[];
  /** The one-click "Use the engine's key" alternative. */
  EngineTokens?: KeyToken[] | null;
  /** Fields WITHOUT tokens only: "Any" (not part of the key) or "Blank". */
  FieldModes: Partial<Record<KeyTokenField, KeyFieldMode>>;
  Anchored: boolean;
  /** The full pill catalogue (every shape + every enabled list). */
  Pills: CurationPill[];
  /** Date-format catalogue (2026-09-08): the formats a DATE / TIME / DATETIME
   *  pill's Item can pin, each with an Example rendered from THIS
   *  transaction's own value date so the picker reads as the operator's data.
   *  Delivered in display order (compact digit shapes, separated, month
   *  names; then times; then datetimes). */
  DateFormats?: DateFormatInfo[] | null;
  Preview: CurationPreview;
  CreatedByUserId?: string | null;
  CreatedAtUtc?: string | null;
  UpdatedByUserId?: string | null;
  UpdatedAtUtc?: string | null;
}

export interface CurationSummary {
  Id: string;
  Name: string | null;
  Key: string;
  Tokens: KeyToken[];
  Anchored: boolean;
  AiMode: KeyFieldMode;
  D2Mode: KeyFieldMode;
  D1Mode?: KeyFieldMode;
  TDMode?: KeyFieldMode;
  SourceTransactionId?: string | null;
  SourceAnchor?: string | null;
  Note?: string | null;
  CreatedByUserId: string;
  CreatedAtUtc: string;
  UpdatedByUserId?: string | null;
  UpdatedAtUtc?: string | null;
  /** Open transactions grouped under it right now. */
  OpenMatches: number;
  /** No untagged matches at the moment — stays stored, revives when a
   *  matching transaction arrives. */
  IsExhausted: boolean;
  /** The Curated View groups the latest run produced (one per txn type). */
  Sets: { SuggestionId: string; SimilarSetId: string; CoverageCount: number; Confidence: SuggestionConfidence; TransactionTypeCodes: string[] }[];
  ExampleTexts: string[];
}

/** Exactly one of the three ids: KeyOverrideId wins, then SuggestionId,
 *  then TransactionId (a NEW curation from that row). */
export async function startCuration(
  req: { TransactionId?: string; KeyOverrideId?: string; SuggestionId?: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<CurationDraft> {
  const res = await fetch(`${BASE}/StartCuration`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'StartCuration'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to open the curation');
  const json = (await res.json()) as { Curation?: CurationDraft };
  if (!json.Curation) throw new Error('The curation could not be opened');
  return json.Curation;
}

export async function previewCuration(
  req: {
    BankSwiftCode: string;
    Side: string;
    Tokens: KeyToken[];
    FieldModes?: Partial<Record<KeyTokenField, KeyFieldMode>>;
    /** Null/omitted = resolved from the source transaction; send true/false
     *  only when the operator forces Starts with / Anywhere. */
    Anchored?: boolean | null;
    SourceTransactionId?: string | null;
    /** Editing a saved curation: its own id, so it doesn't list itself as
     *  an overlap. */
    ExcludeKeyOverrideId?: string | null;
  },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<CurationPreview> {
  const res = await fetch(`${BASE}/PreviewCuration`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'PreviewCuration'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to preview the curation');
  const json = (await res.json()) as { Preview?: CurationPreview };
  if (!json.Preview) throw new Error('The curation preview is unavailable');
  return json.Preview;
}

export async function saveCuration(
  req: {
    /** Null = create; a curation id = update that curation. */
    Id?: string | null;
    BankSwiftCode: string;
    Side: string;
    Name?: string | null;
    Tokens: KeyToken[];
    FieldModes?: Partial<Record<KeyTokenField, KeyFieldMode>>;
    Anchored?: boolean | null;
    SourceTransactionId?: string | null;
    SourceSuggestionId?: string | null;
    Note?: string | null;
    UserId: string;
  },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ curation: KeyOverride | null; runStarted: boolean }> {
  const res = await fetch(`${BASE}/SaveCuration`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveCuration'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save the curation');
  const json = (await res.json()) as { Curation?: KeyOverride | null; RunStarted?: boolean };
  return { curation: json.Curation ?? null, runStarted: json.RunStarted ?? false };
}

export async function getCurations(
  req: { BankSwiftCode: string; Side: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ curations: CurationSummary[]; runStatus: SamplingRunStatus; lastRunAtUtc: string | null }> {
  const res = await fetch(`${BASE}/GetCurations`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetCurations'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch curations');
  const json = (await res.json()) as { Curations?: CurationSummary[]; RunStatus?: SamplingRunStatus; LastRunAtUtc?: string | null };
  return { curations: json.Curations ?? [], runStatus: json.RunStatus ?? 'Idle', lastRunAtUtc: json.LastRunAtUtc ?? null };
}

/** Same as DeleteKeyEdit under the studio's name: the rows return to their
 *  automatic keys at the run this starts. */
export async function deleteCuration(
  keyOverrideId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ runStarted: boolean }> {
  const res = await fetch(`${BASE}/DeleteCuration`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteCuration'),
    body: JSON.stringify({ KeyOverrideId: keyOverrideId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete the curation');
  const json = (await res.json()) as { RunStarted?: boolean };
  return { runStarted: json.RunStarted ?? false };
}

/** The "This part is…" menu content for a selected piece of text, best
 *  first: Detected (the ladder's finds), then Shapes, then Lists. */
export async function suggestCurationPill(
  req: { Text: string; Field?: KeyTokenField; BankSwiftCode?: string; Side?: string; TransactionId?: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<CurationPill[]> {
  const res = await fetch(`${BASE}/SuggestCurationPill`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SuggestCurationPill'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to suggest pills');
  const json = (await res.json()) as { Pills?: CurationPill[] };
  return json.Pills ?? [];
}

/** Newest first. */
export async function getKeyEdits(
  req: { BankSwiftCode: string; Side: string },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<KeyOverride[]> {
  const res = await fetch(`${BASE}/GetKeyEdits`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetKeyEdits'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch key edits');
  const json = (await res.json()) as { Overrides?: KeyOverride[] };
  return json.Overrides ?? [];
}
