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
}

export interface ExportMT940Request {
  FilteringProperties?: FilterProperty[];
  SortingProperties?: SortProperty[];
  /** Intraday (MT942 / Interim MT940) exports only (2026-09-08): whether the
   *  CSV carries the MT940Recommendation* columns. Backend default when
   *  omitted: true (what every export did before the operator could choose).
   *  Ignored when the export holds no intraday row. */
  IncludeMT940Recommendations?: boolean;
  /** The "Match transaction type" toggle's state, so the file's
   *  recommendations are the ones on screen: true = only MT940 rules whose
   *  own Transaction Type Code equals the row's (rules with no code hidden).
   *  Backend default when omitted: true. */
  MatchTransactionType?: boolean;
}
