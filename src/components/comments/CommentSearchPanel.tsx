import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { CommentsProvider } from '../../context/CommentsContext';
import { useLibraryLookup } from '../../hooks/useLibraryLookup';
import { searchTagSpecComments } from '../../api/searchComments';
import { ApiError } from '../../api/apiError';
import type { TagSpecCommentTarget } from '../../types/comments';
import type { TagSpecCommentSearchResult } from '../../types/commentSearch';
import type { TepHeaders } from '../../api/transactions';
import { buildBreadcrumb, breadcrumbToString } from '../../utils/searchBreadcrumb';
import { CommentSearchResultRow } from './CommentSearchResultRow';
import { CommentThreadPanelBody } from './CommentThreadPanelBody';

interface CommentSearchPanelProps {
  open: boolean;
  /** Auto-set scope. `null` means global search (Backlog). Pass a target with
   *  `TagSpecLibraryId` set to scope to one library. */
  target: TagSpecCommentTarget | null;
  onClose: () => void;
  /** Forwarded to the focused thread so users can jump from a result to the
   *  Backlog row. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

type View = { kind: 'search' } | { kind: 'thread'; result: TagSpecCommentSearchResult };

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function CloseXIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5 animate-pulse">
      <div className="h-3 w-1/3 bg-surface-secondary rounded mb-2" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-full bg-surface-secondary" />
        <div className="h-3 w-24 bg-surface-secondary rounded" />
      </div>
      <div className="h-3 w-full bg-surface-secondary rounded mb-1" />
      <div className="h-3 w-4/5 bg-surface-secondary rounded" />
    </div>
  );
}

/**
 * Right-side panel that searches TagSpec comments and, when a result is
 * clicked, swaps to the matching thread inside the same panel shell. Closing
 * the panel discards both the query and any results — opening it again
 * always starts in the idle state.
 */
export function CommentSearchPanel({ open, target, onClose, onNavigateToBacklog }: CommentSearchPanelProps) {
  const auth = useAuth();
  const tepConfig = useTepConfig();
  const libraryLookup = useLibraryLookup();

  const authHeader = auth.getAuthHeaders().Authorization ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const tepHeaders = useMemo<TepHeaders | null>(() => {
    if (!auth.userId) return null;
    return {
      userId: auth.userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [auth.userId, tepConfig]);

  const [view, setView] = useState<View>({ kind: 'search' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TagSpecCommentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerElementRef = useRef<Element | null>(null);

  // Capture the previously focused trigger so we can restore focus on close.
  useEffect(() => {
    if (open) {
      triggerElementRef.current = document.activeElement;
      return;
    }
    const previous = triggerElementRef.current;
    if (previous && previous instanceof HTMLElement) {
      previous.focus();
    }
  }, [open]);

  // Reset everything when the panel closes so reopening starts clean.
  useEffect(() => {
    if (open) return;
    setView({ kind: 'search' });
    setQuery('');
    setResults([]);
    setLoading(false);
    setError(null);
    setFocusedIndex(-1);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [open]);

  // Autofocus the search input on every entry into the search view.
  useEffect(() => {
    if (!open) return;
    if (view.kind !== 'search') return;
    inputRef.current?.focus();
  }, [open, view.kind]);

  // Escape closes the panel from either view. In the thread view, also
  // supports going back when ArrowLeft is pressed while no input is focused.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view.kind === 'thread') {
          // Inside a thread, Escape returns to the search results first.
          setView({ kind: 'search' });
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, view.kind]);

  // Resolve the scope subtitle once per target change.
  const scopeLine = useMemo(() => {
    if (!target) return 'Across All Libraries';
    const crumb = buildBreadcrumb(target, libraryLookup);
    const label = breadcrumbToString(crumb, target);
    return label ? `in ${label}` : 'in this library';
  }, [target, libraryLookup]);

  const runSearch = useCallback(
    async (searchText: string) => {
      if (!accessToken || !tepHeaders) return;
      // Cancel any in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const out = await searchTagSpecComments(searchText, target, accessToken, tepHeaders, controller.signal);
        if (controller.signal.aborted) return;
        setResults(out);
        // Keep keyboard focus on the input. The first row only highlights
        // once the user actively tabs or arrows into the list, otherwise the
        // ring reads as "best match" — which results aren't.
        setFocusedIndex(-1);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [accessToken, tepHeaders, target],
  );

  // Debounced fetch on query change.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Cancel any in-flight + clear stale results so the idle state shows.
      abortRef.current?.abort();
      abortRef.current = null;
      setResults([]);
      setError(null);
      setLoading(false);
      setFocusedIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, runSearch]);

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleResultClick = (result: TagSpecCommentSearchResult) => {
    setView({ kind: 'thread', result });
  };

  const handleBackToSearch = () => {
    setView({ kind: 'search' });
  };

  const handleRetry = () => {
    const trimmed = query.trim();
    if (trimmed.length >= MIN_QUERY_LENGTH) void runSearch(trimmed);
  };

  // Keyboard navigation between rows in the search view.
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = focusedIndex < results.length - 1 ? focusedIndex + 1 : 0;
      setFocusedIndex(next);
      rowRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = focusedIndex > 0 ? focusedIndex - 1 : results.length - 1;
      setFocusedIndex(prev);
      rowRefs.current[prev]?.focus();
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      handleResultClick(results[focusedIndex]);
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = focusedIndex < results.length - 1 ? focusedIndex + 1 : 0;
      setFocusedIndex(next);
      rowRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = focusedIndex > 0 ? focusedIndex - 1 : results.length - 1;
      setFocusedIndex(prev);
      rowRefs.current[prev]?.focus();
    } else if (e.key === 'Backspace' && focusedIndex >= 0) {
      // Return focus to the input without consuming the keypress beyond that.
      inputRef.current?.focus();
    }
  };

  const trimmed = query.trim();
  const showIdle = trimmed.length < MIN_QUERY_LENGTH && results.length === 0 && !loading && !error;
  const showSkeletons = loading && results.length === 0;
  const showEmpty = !loading && !error && trimmed.length >= MIN_QUERY_LENGTH && results.length === 0;
  const showResults = results.length > 0;

  // Build a friendly label for the focused thread header.
  const focusedLabel = useMemo(() => {
    if (view.kind !== 'thread') return null;
    const crumb = buildBreadcrumb(view.result.Target, libraryLookup);
    return breadcrumbToString(crumb, view.result.Target);
  }, [view, libraryLookup]);

  const panel = (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-label={view.kind === 'thread' ? 'Comment thread' : 'Search Comments in TagSpecs'}
        aria-hidden={!open}
        data-tour="comment-search-panel"
        className={`fixed inset-y-0 right-0 z-[70] w-full md:w-[44%] lg:w-[38%] max-w-[640px] bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'
        }`}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-5 py-3.5 flex items-start gap-3">
          {view.kind === 'thread' && (
            <button
              type="button"
              onClick={handleBackToSearch}
              aria-label="Back to results"
              title="Back to results"
              className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-body cursor-pointer"
            >
              <BackArrowIcon />
            </button>
          )}
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">
              {view.kind === 'thread' ? 'Comment thread' : 'Search Comments in TagSpecs'}
            </div>
            <div className="text-sm font-medium text-body truncate">
              {view.kind === 'thread' ? (focusedLabel || 'Thread') : scopeLine}
            </div>
            {view.kind === 'thread' && onNavigateToBacklog && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToBacklog(view.result.Target);
                  onClose();
                }}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M5 3h6a1 1 0 0 1 1 1v6M11 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                View in Backlog
              </button>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close search panel"
            className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-body cursor-pointer"
          >
            <CloseXIcon />
          </button>
        </header>

        {view.kind === 'search' ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-5 pt-3 pb-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                  <SearchIcon />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search Comments in TagSpecs..."
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-border bg-surface text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                  aria-label="Search Comments in TagSpecs"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5">
                  {loading && <Spinner />}
                  {query.length > 0 && !loading && (
                    <button
                      type="button"
                      onClick={handleClear}
                      aria-label="Clear search"
                      className="text-muted hover:text-body cursor-pointer"
                    >
                      <CloseXIcon size={14} />
                    </button>
                  )}
                </span>
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto px-5 pb-4 space-y-2"
              onKeyDown={handleRowKeyDown}
            >
              {showIdle && (
                <div className="mt-12 text-center px-6">
                  <p className="text-sm font-medium text-body">Type at least {MIN_QUERY_LENGTH} characters to search.</p>
                  <p className="text-xs text-muted mt-1">Searching {scopeLine}.</p>
                </div>
              )}

              {showSkeletons && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              )}

              {error && (
                <div className="mt-12 text-center px-6">
                  <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Search failed.</p>
                  <p className="text-xs text-muted mt-1">{error}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-3 inline-flex items-center px-3 py-1.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-300 dark:hover:bg-cyan-900/50 cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              )}

              {showEmpty && (
                <div className="mt-12 text-center px-6">
                  <p className="text-sm font-medium text-body">No comments match “{trimmed}”.</p>
                  <p className="text-xs text-muted mt-1">Try different keywords.</p>
                </div>
              )}

              {showResults && (
                <>
                  <p className="text-[11px] text-muted px-1 pb-1">
                    {results.length} {results.length === 1 ? 'match' : 'matches'} {scopeLine}
                  </p>
                  <div className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
                    {results.map((result, idx) => (
                      <CommentSearchResultRow
                        key={`${result.RootCommentId}:${result.Id}:${idx}`}
                        ref={(el) => {
                          rowRefs.current[idx] = el;
                        }}
                        result={result}
                        query={trimmed}
                        libraryLookup={libraryLookup}
                        isFocused={idx === focusedIndex}
                        onClick={() => handleResultClick(result)}
                        onFocus={() => setFocusedIndex(idx)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          // Thread view — wrap the body in a fresh CommentsProvider scoped to
          // the result's library so threads from any library can be opened
          // (the Backlog tab has no ambient provider for a specific lib).
          tepHeaders && (
            <CommentsProvider
              libraryId={view.result.Target.TagSpecLibraryId}
              authToken={accessToken}
              tepHeaders={tepHeaders}
              eager
            >
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <CommentThreadPanelBody
                  open={open}
                  target={view.result.Target}
                  authToken={accessToken}
                  focusCommentId={view.result.RootCommentId}
                  focusReplyId={view.result.Depth > 0 ? view.result.Id : null}
                />
              </div>
            </CommentsProvider>
          )
        )}
      </aside>
    </>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
