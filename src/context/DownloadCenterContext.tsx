import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useTepConfig } from './TepConfigContext';
import type { TepHeaders, FilterProperty, SortProperty } from '../api/transactions';
import type { DownloadCenterFile } from '../types/downloadCenter';
import {
  exportMT940Transactions,
  getDownloadCenterFiles,
  downloadMT940Transactions,
  deleteDownloadCenterFile,
  clearDownloadCenterFiles,
} from '../api/downloadCenter';
import { csvBlobToXlsxBlob, csvFilenameToXlsx } from '../utils/csvBlobToXlsxBlob';
import { downloadBlob } from '../utils/downloadBlob';

const POLL_INTERVAL_MS = 3_000;
const SEEN_READY_LS_KEY = 'tep.downloadCenter.seenReadyIds';

/** Result of a per-row download attempt, surfaced inline on the row so the
 *  modal can show "still in progress" / "failed" / "not found" without
 *  toasting outside the modal. */
export type DownloadAttemptResult =
  | { kind: 'ok' }
  | { kind: 'not_ready'; message: string }
  | { kind: 'error'; message: string };

export interface DownloadCenterApi {
  isOpen: boolean;
  files: DownloadCenterFile[];
  loading: boolean;
  error: string | null;
  unreadReadyCount: number;
  openModal: () => void;
  closeModal: () => void;
  refresh: () => Promise<void>;
  triggerExport: (
    filters: FilterProperty[],
    sortingProps: SortProperty[],
  ) => Promise<string>;
  downloadFile: (fileId: string) => Promise<DownloadAttemptResult>;
  deleteFile: (fileId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  /** Imperative refresh entry-point used by the notifications subsystem to
   *  short-circuit polling when an EXPORT_READY / EXPORT_FAILED arrives. */
  notifyExportEvent: () => void;
}

const DownloadCenterContext = createContext<DownloadCenterApi | null>(null);

function readSeenReadyIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_READY_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

function persistSeenReadyIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_READY_LS_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota exceeded / private mode — fail open; badge will just over-count.
  }
}

interface DownloadCenterProviderProps {
  children: ReactNode;
}

/**
 * Owns the operator's MT940 export jobs and the Download Center modal's
 * open/close state. The provider is auth-aware: it reads token + TEP
 * headers fresh inside each API call (matching the rest of the codebase)
 * so a session refresh during a long-running poll doesn't bork the request.
 */
export function DownloadCenterProvider({ children }: DownloadCenterProviderProps) {
  const { getAuthHeaders, refreshIfNeeded, userId } = useAuth();
  const tepConfig = useTepConfig();

  const tepHeaders = useMemo<TepHeaders | null>(() => {
    if (!userId) return null;
    return {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<DownloadCenterFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenReadyIds, setSeenReadyIds] = useState<Set<string>>(() => readSeenReadyIds());

  // Mirror state into refs so the callbacks can keep stable identities and
  // still read the latest values. Same pattern used by `useWizardCommentDrafts`.
  const filesRef = useRef(files);
  filesRef.current = files;
  const seenReadyIdsRef = useRef(seenReadyIds);
  seenReadyIdsRef.current = seenReadyIds;

  const getToken = useCallback(async (): Promise<string | null> => {
    await refreshIfNeeded();
    const authHeader = getAuthHeaders().Authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice('Bearer '.length);
    return token || null;
  }, [getAuthHeaders, refreshIfNeeded]);

  const refresh = useCallback(async () => {
    if (!tepHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      const list = await getDownloadCenterFiles(token, tepHeaders);
      // Sort newest-first; backend already does this but defend against
      // intermediaries reshuffling on the wire.
      list.sort((a, b) => (b.CreatedDate ?? '').localeCompare(a.CreatedDate ?? ''));
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Download Center files.');
    } finally {
      setLoading(false);
    }
  }, [getToken, tepHeaders]);

  const openModal = useCallback(() => {
    setIsOpen(true);
    // Mark every currently-READY file as seen so the header badge clears.
    // Using filesRef here means the operator can re-open later and not get
    // the same READY files re-counted as unread.
    const nextSeen = new Set(seenReadyIdsRef.current);
    let mutated = false;
    for (const f of filesRef.current) {
      if (f.Status === 'READY' && !nextSeen.has(f.Id)) {
        nextSeen.add(f.Id);
        mutated = true;
      }
    }
    if (mutated) {
      setSeenReadyIds(nextSeen);
      persistSeenReadyIds(nextSeen);
    }
    // Fire-and-forget refresh so the modal opens against live data.
    void refresh();
  }, [refresh]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const triggerExport = useCallback(
    async (filters: FilterProperty[], sortingProps: SortProperty[]): Promise<string> => {
      if (!tepHeaders) throw new Error('Not authenticated');
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const { FileId } = await exportMT940Transactions(
        {
          FilteringProperties: filters,
          SortingProperties: sortingProps,
        },
        token,
        tepHeaders,
      );
      // Refresh so the new INPROGRESS row appears immediately if the modal
      // is open or about to be opened.
      void refresh();
      return FileId;
    },
    [getToken, tepHeaders, refresh],
  );

  const downloadFile = useCallback(
    async (fileId: string): Promise<DownloadAttemptResult> => {
      if (!tepHeaders) return { kind: 'error', message: 'Not authenticated' };
      const token = await getToken();
      if (!token) return { kind: 'error', message: 'Not authenticated' };
      try {
        const result = await downloadMT940Transactions(fileId, token, tepHeaders);
        switch (result.kind) {
          case 'ready': {
            const xlsxBlob = await csvBlobToXlsxBlob(result.blob);
            downloadBlob(xlsxBlob, csvFilenameToXlsx(result.suggestedFilename));
            // Mark as seen so the unread badge doesn't keep nagging.
            const nextSeen = new Set(seenReadyIdsRef.current);
            if (!nextSeen.has(fileId)) {
              nextSeen.add(fileId);
              setSeenReadyIds(nextSeen);
              persistSeenReadyIds(nextSeen);
            }
            return { kind: 'ok' };
          }
          case 'in_progress':
            void refresh();
            return { kind: 'not_ready', message: result.message };
          case 'failed':
            void refresh();
            return { kind: 'error', message: result.message };
          case 'not_found':
            void refresh();
            return { kind: 'error', message: result.message };
        }
      } catch (e) {
        return { kind: 'error', message: e instanceof Error ? e.message : 'Download failed.' };
      }
    },
    [getToken, tepHeaders, refresh],
  );

  const deleteFile = useCallback(
    async (fileId: string): Promise<void> => {
      if (!tepHeaders) return;
      const token = await getToken();
      if (!token) return;
      // Optimistic remove so the row vanishes immediately.
      setFiles((prev) => prev.filter((f) => f.Id !== fileId));
      try {
        await deleteDownloadCenterFile(fileId, token, tepHeaders);
      } catch (e) {
        // Roll back by refetching.
        await refresh();
        throw e;
      }
    },
    [getToken, tepHeaders, refresh],
  );

  const clearAll = useCallback(async () => {
    if (!tepHeaders) return;
    const token = await getToken();
    if (!token) return;
    const prev = filesRef.current;
    setFiles([]);
    try {
      await clearDownloadCenterFiles(token, tepHeaders);
    } catch (e) {
      setFiles(prev);
      throw e;
    }
  }, [getToken, tepHeaders]);

  const notifyExportEvent = useCallback(() => {
    void refresh();
  }, [refresh]);

  // Polling: only while the modal is open AND at least one file is INPROGRESS.
  useEffect(() => {
    if (!isOpen) return;
    const hasInProgress = files.some((f) => f.Status === 'INPROGRESS');
    if (!hasInProgress) return;
    const id = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOpen, files, refresh]);

  const unreadReadyCount = useMemo(
    () => files.reduce((acc, f) => acc + (f.Status === 'READY' && !seenReadyIds.has(f.Id) ? 1 : 0), 0),
    [files, seenReadyIds],
  );

  const value = useMemo<DownloadCenterApi>(
    () => ({
      isOpen,
      files,
      loading,
      error,
      unreadReadyCount,
      openModal,
      closeModal,
      refresh,
      triggerExport,
      downloadFile,
      deleteFile,
      clearAll,
      notifyExportEvent,
    }),
    [
      isOpen,
      files,
      loading,
      error,
      unreadReadyCount,
      openModal,
      closeModal,
      refresh,
      triggerExport,
      downloadFile,
      deleteFile,
      clearAll,
      notifyExportEvent,
    ],
  );

  return (
    <DownloadCenterContext.Provider value={value}>
      {children}
    </DownloadCenterContext.Provider>
  );
}

export function useDownloadCenter(): DownloadCenterApi {
  const ctx = useContext(DownloadCenterContext);
  if (!ctx) {
    throw new Error('useDownloadCenter must be used within a DownloadCenterProvider');
  }
  return ctx;
}

/** Same as `useDownloadCenter` but returns null instead of throwing when
 *  used outside the provider. Handy for components that may render before
 *  the provider mounts (e.g. shared header buttons). */
export function useOptionalDownloadCenter(): DownloadCenterApi | null {
  return useContext(DownloadCenterContext);
}
