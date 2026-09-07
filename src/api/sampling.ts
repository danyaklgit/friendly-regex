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

export type KeyTokenField = 'AI' | 'D2';
export type KeyTokenKind = 'Literal' | 'Placeholder' | 'List';

export interface KeyToken {
  /** "AI" (AdditionalInformation) or "D2" (Description2). */
  Field: KeyTokenField;
  /** Literal = exact words; Placeholder = one of the nine built-ins
   *  (Text = name without brackets, e.g. "DATE"); List = a LOV list
   *  (Text = list tag, Item = the item for Keep-item lists). */
  Kind: KeyTokenKind;
  Text: string;
  Item?: string | null;
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
  CreatedByUserId: string;
  CreatedAtUtc: string;
  Note?: string | null;
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
