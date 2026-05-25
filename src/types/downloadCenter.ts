import type { FilterProperty, SortProperty } from '../api/transactions';

export type DownloadCenterFileStatus = 'INPROGRESS' | 'READY' | 'FAILED';

/**
 * Shape of a single export job as returned by `GetDownloadCenterFiles` and
 * inside the JSON-error branch of `DownloadMT940Transactions`. Field names
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
}
