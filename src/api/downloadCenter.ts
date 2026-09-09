import type { TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';
import type {
  DownloadCenterFile,
  ExportMT940Request,
  ExportContext,
  ExportColumnSelection,
  ExportProfile,
  ExportColumnInfo,
} from '../types/downloadCenter';

const BASE = '/api/tep/api/v1/TEP';

interface SfmEnvelope {
  SFM?: {
    Constant?: string | null;
    Major?: { Constant?: string | null };
  };
}

// --- ExportTEPTransactions -----------------------------------------------
// Canonical name since 2026-08-20 (ExportMT940Transactions remains a
// deprecated alias slated for retirement). Route and ActivityTag are
// validated as a pair server-side — change them together.

interface ExportResponse extends SfmEnvelope {
  FileId?: string;
}

export async function exportTepTransactions(
  req: ExportMT940Request,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ FileId: string }> {
  const res = await fetch(`${BASE}/ExportTEPTransactions`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'ExportTEPTransactions'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to queue export');
  const json = (await res.json()) as ExportResponse;
  if (!json.FileId) throw new Error('Server did not return a FileId for the queued export.');
  return { FileId: json.FileId };
}

// --- ExportConfiguration (central export, backend 2026-09-02) -------------
// Same lifecycle as ExportTEPTransactions: returns a FileId, the record shows
// up in GetDownloadCenterFiles (FileType CONFIGURATION_EXPORT), EXPORT_READY /
// EXPORT_FAILED notifications fire, and the file downloads via
// DownloadTEPTransactions. Empty request = everything as a zip.

/** Topic tokens follow the export file naming (TEP_<Topic>_<stamp>.json). */
export const EXPORT_TOPICS = [
  'TagSpecLibraries',
  'LOVs',
  'VIPCustomers',
  'Extractions',
  'Attributes',
  'TagsHierarchy',
] as const;
export type ExportTopic = (typeof EXPORT_TOPICS)[number];

export interface ExportConfigurationRequest {
  Topics?: ExportTopic[];
  /** Narrow the TagSpecLibraries topic; ids from GetTagSpecLibraries. */
  TagSpecLibraryIds?: string[];
  /** Narrow the LOVs topic; tags from GetLOVLists. */
  LOVTags?: string[];
  /** false = one TEP_Export_<stamp>.json; true/omitted = zip per topic + manifest. */
  AsZip?: boolean;
}

export async function exportConfiguration(
  req: ExportConfigurationRequest,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ FileId: string }> {
  const res = await fetch(`${BASE}/ExportConfiguration`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'ExportConfiguration'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to queue configuration export');
  const json = (await res.json()) as ExportResponse;
  if (!json.FileId) throw new Error('Server did not return a FileId for the queued export.');
  return { FileId: json.FileId };
}

// --- Export profiles (backend 2026-09-09, API ref §9.1c) -------------------
// Shared saved column selections for ExportTEPTransactions. GetExportProfiles
// also carries the fixed-column catalogue and the workspace's dynamic keys,
// so the export prompt is fully data-driven (no column names hard-coded).

export interface GetExportProfilesResponse {
  ContextKey?: string;
  /** The profile to pre-select: most used in this workspace, else most used
   *  anywhere, else the Operator default. */
  SuggestedProfileId?: string | null;
  /** RANKED: most used here first, then most used anywhere, then built-ins,
   *  then by name — render in this order. */
  Profiles: ExportProfile[];
  /** Every fixed column the export can emit, in the legacy order. */
  Columns: ExportColumnInfo[];
  /** Custom-field keys known for the context's DataSetType. */
  CustomFieldKeys: string[];
  /** Attribute keys extracted for the context's bank and type. */
  AttributeKeys: string[];
}

interface GetExportProfilesJson extends SfmEnvelope, Partial<GetExportProfilesResponse> {}

export async function getExportProfiles(
  exportContext: ExportContext | undefined,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<GetExportProfilesResponse> {
  const res = await fetch(`${BASE}/GetExportProfiles`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetExportProfiles'),
    body: JSON.stringify(exportContext ? { ExportContext: exportContext } : {}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load export profiles');
  const json = (await res.json()) as GetExportProfilesJson;
  return {
    ContextKey: json.ContextKey,
    SuggestedProfileId: json.SuggestedProfileId ?? null,
    Profiles: json.Profiles ?? [],
    Columns: json.Columns ?? [],
    CustomFieldKeys: json.CustomFieldKeys ?? [],
    AttributeKeys: json.AttributeKeys ?? [],
  };
}

export interface SaveExportProfileRequest {
  /** Omitted/null = create; a profile id = update it (built-ins included). */
  Id?: string | null;
  /** 1-80 chars, unique across profiles case-insensitively. */
  Name: string;
  Description?: string | null;
  /** Normalised on save: aliases resolved, duplicate ids collapsed, unknown
   *  ids dropped (reported via IgnoredColumns), rule modes defaulted. */
  Selection: ExportColumnSelection;
}

export interface SaveExportProfileResult {
  Profile: ExportProfile;
  /** Column ids the request named that the export does not know — they were
   *  dropped. Empty when the picker is built from GetExportProfiles.Columns;
   *  surface it when it is not. */
  IgnoredColumns: string[];
}

interface SaveExportProfileJson extends SfmEnvelope {
  Profile?: ExportProfile;
  IgnoredColumns?: string[];
}

/** 400 `SFM_INVALID_INPUT_PARAMETERS` (surfaced as ApiError status 400) when
 *  the name is missing / too long / already used by another profile, when
 *  Selection is missing or would export no column at all, or when Id names
 *  no profile. */
export async function saveExportProfile(
  req: SaveExportProfileRequest,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<SaveExportProfileResult> {
  const res = await fetch(`${BASE}/SaveExportProfile`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveExportProfile'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save the export profile');
  const json = (await res.json()) as SaveExportProfileJson;
  if (!json.Profile) throw new Error('Server did not return the saved profile.');
  return { Profile: json.Profile, IgnoredColumns: json.IgnoredColumns ?? [] };
}

/** Built-ins and unknown ids refuse with 400 `SFM_INVALID_INPUT_PARAMETERS`
 *  — keep the Delete button disabled for built-ins. Deleting a profile does
 *  not touch Download Center files exported with it (they keep ProfileName). */
export async function deleteExportProfile(
  id: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/DeleteExportProfile`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteExportProfile'),
    body: JSON.stringify({ Id: id }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete the export profile');
}

// --- GetDownloadCenterFiles --------------------------------------------------

interface GetFilesResponse extends SfmEnvelope {
  Files?: DownloadCenterFile[];
}

/**
 * Backend returns a non-2xx with SFM `SFM_NO_DOWNLOAD_CENTER_FILES_FOUND`
 * when the user has no export jobs. That's a valid empty result, not an
 * error — same short-circuit pattern as `getTagSpecComments` and
 * `getDistinctFieldValues`.
 */
export async function getDownloadCenterFiles(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<DownloadCenterFile[]> {
  const res = await fetch(`${BASE}/GetDownloadCenterFiles`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetDownloadCenterFiles'),
    body: JSON.stringify({}),
    signal,
  });
  let json: GetFilesResponse | null = null;
  try {
    json = (await res.clone().json()) as GetFilesResponse;
  } catch {
    json = null;
  }
  if (json?.SFM?.Constant === 'SFM_NO_DOWNLOAD_CENTER_FILES_FOUND') return [];
  await throwIfNotOk(res, 'Failed to load Download Center files');
  return json?.Files ?? [];
}

// --- DownloadTEPTransactions ----------------------------------------------
// Canonical name since 2026-08-20 (DownloadMT940Transactions is the
// deprecated alias). Route + ActivityTag change together (paired
// server-side validation).

/**
 * The download endpoint returns EITHER the CSV file as a binary stream
 * (Content-Type: text/csv) when the file is ready, OR a JSON SFM envelope
 * when the file is still in progress / failed / not found. Callers MUST
 * branch on `result.kind` rather than relying on HTTP status — both shapes
 * arrive with status 200.
 */
export type DownloadResult =
  | { kind: 'ready'; blob: Blob; suggestedFilename: string }
  | { kind: 'in_progress'; file?: DownloadCenterFile; message: string }
  | { kind: 'failed'; file?: DownloadCenterFile; message: string }
  | { kind: 'not_found'; message: string };

interface DownloadJsonError extends SfmEnvelope {
  File?: DownloadCenterFile;
}

/**
 * Best-effort `Content-Disposition` filename parse. Falls back to a
 * sensible default if the header is missing or malformed (some proxies
 * strip it). The backend uses `filename="MT940_Export_<timestamp>.csv"`.
 */
function parseFilename(res: Response, fallback: string): string {
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = cd.match(/filename\*?=(?:UTF-\d['']*)?"?([^";]+)"?/i);
  if (m && m[1]) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  return fallback;
}

export async function downloadTepTransactions(
  fileId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const res = await fetch(`${BASE}/DownloadTEPTransactions`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DownloadTEPTransactions'),
    body: JSON.stringify({ FileId: fileId }),
    signal,
  });
  const contentType = (res.headers.get('Content-Type') ?? '').toLowerCase();
  const disposition = res.headers.get('Content-Disposition') ?? '';

  // A READY file streams back as csv (transactions), zip or a single JSON
  // file (configuration export). The in-progress/failed states come back as
  // a JSON SFM envelope WITHOUT a Content-Disposition — so an attachment
  // header also marks a ready file even when the content type is JSON.
  const isReadyFile =
    contentType.includes('text/csv') ||
    contentType.includes('application/zip') ||
    contentType.includes('octet-stream') ||
    /filename/i.test(disposition);
  if (isReadyFile) {
    if (!res.ok) {
      await throwIfNotOk(res, 'Download failed');
    }
    const blob = await res.blob();
    const fallback = contentType.includes('zip')
      ? `TEP_Export_${fileId}.zip`
      : contentType.includes('csv')
        ? `MT940_Export_${fileId}.csv`
        : `TEP_Export_${fileId}.json`;
    const suggestedFilename = parseFilename(res, fallback);
    return { kind: 'ready', blob, suggestedFilename };
  }

  // JSON branch: parse the SFM envelope and map to a typed result.
  let json: DownloadJsonError | null = null;
  try {
    json = (await res.clone().json()) as DownloadJsonError;
  } catch {
    json = null;
  }
  const constant = json?.SFM?.Constant ?? '';
  const file = json?.File;
  switch (constant) {
    case 'SFM_EXPORT_STILL_IN_PROGRESS':
      return { kind: 'in_progress', file, message: 'Export is still in progress.' };
    case 'SFM_EXPORT_FAILED':
      return {
        kind: 'failed',
        file,
        message: file?.ErrorMessage ?? 'The export job failed on the server.',
      };
    case 'SFM_EXPORT_NOT_FOUND':
      return { kind: 'not_found', message: 'Export not found — it may have been deleted.' };
    default:
      // Fall back to throwIfNotOk so the SFM Minor message bubbles up.
      await throwIfNotOk(res, 'Download failed');
      // If status was 200 but we couldn't parse a known SFM, treat as failed.
      return { kind: 'failed', file, message: 'Unexpected download response.' };
  }
}

// --- DeleteDownloadCenterFile ------------------------------------------------

export async function deleteDownloadCenterFile(
  fileId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/DeleteDownloadCenterFile`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteDownloadCenterFile'),
    body: JSON.stringify({ FileId: fileId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete export file');
}

// --- ClearDownloadCenterFiles ------------------------------------------------

export async function clearDownloadCenterFiles(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/ClearDownloadCenterFiles`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'ClearDownloadCenterFiles'),
    body: JSON.stringify({}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to clear export files');
}
