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
