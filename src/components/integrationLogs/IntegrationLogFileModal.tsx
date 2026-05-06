import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import {
  getIntegrationLogFile,
  type IntegrationLog,
  type TepHeaders,
} from '../../api/transactions';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

type Pane = 'request' | 'response';

interface FileState {
  loading: boolean;
  error: string | null;
  content: string;
}

const EMPTY: FileState = { loading: true, error: null, content: '' };

function pretty(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

interface IntegrationLogFileModalProps {
  log: IntegrationLog;
  onClose: () => void;
}

export function IntegrationLogFileModal({ log, onClose }: IntegrationLogFileModalProps) {
  const { getAuthHeaders, userId, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();

  const [pane, setPane] = useState<Pane>('request');
  const [request, setRequest] = useState<FileState>(EMPTY);
  const [response, setResponse] = useState<FileState>(EMPTY);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Hold auth/config in a ref so the fetch effect doesn't re-fire because
  // useAuth() returns a new object reference each render.
  const authRef = useRef({ getAuthHeaders, userId, refreshIfNeeded, tepConfig });
  authRef.current = { getAuthHeaders, userId, refreshIfNeeded, tepConfig };

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRequest(EMPTY);
    setResponse(EMPTY);

    let cancelled = false;
    (async () => {
      try {
        const { getAuthHeaders: gh, userId: uid, refreshIfNeeded: refresh, tepConfig: cfg } =
          authRef.current;
        await refresh();
        const headers = gh();
        const token = headers.Authorization?.replace('Bearer ', '') ?? '';
        if (!token || !uid) {
          if (!cancelled) {
            setRequest({ loading: false, error: 'Not authenticated', content: '' });
            setResponse({ loading: false, error: 'Not authenticated', content: '' });
          }
          return;
        }
        const tepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: uid,
          tenantCode: cfg.ttpTenantCode,
          languageCode: cfg.languageCode,
          timeZone: cfg.timeZone,
          requestId: cfg.ttpRequestId,
        };

        const reqPromise = getIntegrationLogFile(
          { Id: log.Id, FileType: 'REQUEST' },
          token,
          tepHeaders,
          controller.signal,
        )
          .then((r) => {
            if (!controller.signal.aborted) {
              setRequest({ loading: false, error: null, content: r.Content ?? '' });
            }
          })
          .catch((err) => {
            if (!controller.signal.aborted) {
              setRequest({
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to load request',
                content: '',
              });
            }
          });

        const resPromise = getIntegrationLogFile(
          { Id: log.Id, FileType: 'RESPONSE' },
          token,
          tepHeaders,
          controller.signal,
        )
          .then((r) => {
            if (!controller.signal.aborted) {
              setResponse({ loading: false, error: null, content: r.Content ?? '' });
            }
          })
          .catch((err) => {
            if (!controller.signal.aborted) {
              setResponse({
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to load response',
                content: '',
              });
            }
          });

        await Promise.all([reqPromise, resPromise]);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to load files';
        setRequest({ loading: false, error: message, content: '' });
        setResponse({ loading: false, error: message, content: '' });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [log.Id]);

  const active = pane === 'request' ? request : response;
  const display = pretty(active.content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in some contexts; silently ignore.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Integration Log · ${log.Endpoint}`}
      fullHeight
    >
      <div className="flex flex-col gap-3 h-full">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Statement Id</div>
            <div className="text-body font-mono">{log.StatementId || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Status</div>
            <div className="text-body">
              {log.StatusType}
              {log.StatusCode ? ` · ${log.StatusCode}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border">
          <div className="flex">
            <button
              type="button"
              onClick={() => setPane('request')}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                pane === 'request'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-body-secondary hover:text-heading'
              }`}
            >
              Request
            </button>
            <button
              type="button"
              onClick={() => setPane('response')}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                pane === 'response'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-body-secondary hover:text-heading'
              }`}
            >
              Response
            </button>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleCopy}
            disabled={active.loading || !!active.error || !display}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          {active.loading ? (
            <div className="h-full p-3 rounded border border-border bg-surface-tertiary animate-pulse space-y-2 overflow-hidden">
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-3/5 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ) : active.error ? (
            <div className="h-full flex items-center justify-center text-xs text-red-600">
              {active.error}
            </div>
          ) : (
            <pre className="h-full overflow-auto custom-scrollbar bg-surface-tertiary text-body font-mono text-xs whitespace-pre-wrap p-3 rounded border border-border">
              {display || <span className="text-muted">(empty)</span>}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
}
