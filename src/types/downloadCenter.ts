import type { FilterProperty, SortProperty } from '../api/transactions';

export type DownloadCenterFileStatus = 'INPROGRESS' | 'READY' | 'FAILED';

/**
 * Shape of a single export job as returned by `GetDownloadCenterFiles` and
 * inside the JSON-error branch of `DownloadTEPTransactions`. Field names
 * mirror the backend exactly so consumers can pass the object straight back
 * to the API where needed.
 */
export interface DownloadCenterFile {
  Id: string;
  UserId: string;
  FileType: string;
  Status: DownloadCenterFileStatus;
  FileName: string;
  FMSId?: string | null;
  DownloadLink?: string | null;
  FilteringProperties?: FilterProperty[];
  SortingProperties?: SortProperty[];
  CreatedDate: string;
  CompletedDate?: string | null;
  ErrorMessage?: string | null;
  /** Export-profile stamp (2026-09-09): which profile laid the CSV out.
   *  Null/absent for pre-profile files and profile-less legacy exports. */
  ProfileId?: string | null;
  ProfileName?: string | null;
}

// --- Export profiles (backend 2026-09-09, API ref §9.1c) --------------------
// A profile is a saved column selection shared by every operator. Two are
// built in (`legacy-everything` = today's full layout, `operator-default` =
// the operations team's sixteen columns); both editable, neither deletable.

/** The workspace an export is taken from. Usage is counted under the key
 *  `DataSetType|BankSwiftCode|Side|ClientCode|ErpCode`, which is how
 *  GetExportProfiles ranks profiles for the workspace the prompt opened
 *  from. Partial contexts are fine (empty parts stay empty in the key). */
export interface ExportContext {
  DataSetType?: string;
  BankSwiftCode?: string;
  Side?: string;
  ClientCode?: string;
  ErpCode?: string;
}

export type ExportKeyRuleMode = 'All' | 'None' | 'Listed';

/** How a dynamic block (one column per key present in the data) exports:
 *  `All` = every key the batch carries, `None` = block left out, `Listed` =
 *  exactly `Keys` in that order (a listed key the batch lacks still gets its
 *  blank column, so the sheet keeps one shape from export to export). */
export interface ExportKeyRule {
  Mode?: ExportKeyRuleMode;
  Keys?: string[];
}

/** An attribute block: key rule plus `Json` (default true) = also emit the
 *  whole-list JSON column (`OpsAttributes` / `Attributes`) before the
 *  per-key columns. */
export interface ExportAttributeRule extends ExportKeyRule {
  Json?: boolean;
}

/** The stored meaning of the two ExportTEPTransactions recommendation flags
 *  (both default true). Only matters for exports holding intraday rows; the
 *  live flags, when sent, win over this stored rule. */
export interface ExportRecommendationRule {
  Include?: boolean;
  MatchTransactionType?: boolean;
}

/** What a profile stores and what an ad-hoc export sends inline. `Columns`
 *  holds fixed column ids (= CSV header names) in output order; the full
 *  catalogue comes from GetExportProfiles.Columns. */
export interface ExportColumnSelection {
  Columns?: string[];
  CustomFields?: ExportKeyRule;
  OpsAttributes?: ExportAttributeRule;
  Attributes?: ExportAttributeRule;
  Recommendations?: ExportRecommendationRule;
}

export interface ExportProfileUsage {
  Context: string;
  Count: number;
  LastUsedAtUtc?: string | null;
  LastUsedByUserId?: string | null;
}

export interface ExportProfile {
  Id: string;
  /** Unique across profiles (case-insensitive), 1-80 chars. */
  Name: string;
  Description?: string | null;
  /** `legacy-everything` / `operator-default` for the built-ins; null for an
   *  operator's own. Both keys are accepted wherever a ProfileId is expected. */
  BuiltInKey?: string | null;
  /** Built-ins are editable, not deletable. */
  IsBuiltIn?: boolean;
  Selection: ExportColumnSelection;
  CreatedByUserId?: string;
  CreatedAtUtc?: string;
  UpdatedByUserId?: string | null;
  UpdatedAtUtc?: string | null;
  Usage?: ExportProfileUsage[];
  /** Computed per request: exports that used this profile in the request's
   *  workspace / anywhere / whether it is the one to pre-select. */
  UsageForContext?: number;
  TotalUsage?: number;
  IsSuggested?: boolean;
}

/** One fixed column for the picker. Groups arrive in catalogue order:
 *  Statement, Ops tagging, Active tagging, Record, Ledger, Ledger document,
 *  Ledger line. `Label` is the id put into words; the CSV header is the id. */
export interface ExportColumnInfo {
  Id: string;
  Label: string;
  Group: string;
}

export interface ExportMT940Request {
  FilteringProperties?: FilterProperty[];
  SortingProperties?: SortProperty[];
  /** Intraday (MT942 / Interim MT940) exports only (2026-09-08): whether the
   *  CSV carries the MT940Recommendation* columns. Backend default when
   *  omitted: the profile's stored rule (true on both built-ins). When sent
   *  it WINS over the profile's rule — it is the live choice on the prompt.
   *  Ignored when the export holds no intraday row. */
  IncludeMT940Recommendations?: boolean;
  /** The "Match transaction type" toggle's state, so the file's
   *  recommendations are the ones on screen: true = only MT940 rules whose
   *  own Transaction Type Code equals the row's (rules with no code hidden).
   *  Same precedence as IncludeMT940Recommendations. */
  MatchTransactionType?: boolean;
  /** Export profile (2026-09-09): id of a saved profile — or a built-in key —
   *  whose selection lays the CSV out. Omitted: `Selection` is used; both
   *  omitted: the legacy layout, every column, byte-identical to pre-profile
   *  exports. */
  ProfileId?: string;
  /** Ad-hoc selection ("export with these columns once"), used when
   *  ProfileId is omitted. */
  Selection?: ExportColumnSelection;
  /** The workspace the export is taken from — counted against the profile so
   *  GetExportProfiles can suggest it for that workspace next time. Omitted:
   *  the backend reads it off the request's EQ / single-IN filters. (Named
   *  ExportContext, not Context — the common envelope already has Context.) */
  ExportContext?: ExportContext;
}
