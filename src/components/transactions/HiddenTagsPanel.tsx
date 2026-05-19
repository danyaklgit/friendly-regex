import { useEffect, useRef } from 'react';
import type { TagSpecDefinition } from '../../types';
import type { DefinitionVersionInfo } from '../../utils/definitionVersions';
import { TagBadge } from './TagBadge';
import { Tooltip } from '../shared/Tooltip';
import { renderTagTooltip } from './TransactionTable';

export interface HiddenTagItem {
  /** Stable unique key (defId). */
  key: string;
  /** OpsTagSpecDefinitionId — the identity by which rows are hidden. */
  defId: string;
  /** Tag name as it appears on rows matched by this definition. */
  name: string;
  /** Definition object (so badge & tooltip mirror the table cell). */
  def?: TagSpecDefinition;
}

interface HiddenTagsPanelProps {
  open: boolean;
  onClose: () => void;
  items: HiddenTagItem[];
  hiddenCount: number;
  originalDefinitionIds?: Set<string>;
  definitionSourceMap: Map<string, string>;
  definitionVersions: Map<string, DefinitionVersionInfo>;
  onUnhide: (defId: string, name: string) => void;
  onUnhideAll: () => void;
  busy?: boolean;
}

export function HiddenTagsPanel({
  open,
  onClose,
  items,
  hiddenCount,
  originalDefinitionIds,
  definitionSourceMap,
  definitionVersions,
  onUnhide,
  onUnhideAll,
  busy = false,
}: HiddenTagsPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-label="Hidden tags"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 w-full md:w-[420px] max-w-[480px] bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Triage</div>
            <h2 className="text-sm font-semibold text-heading">
              Hidden Tag Specs ({hiddenCount})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={onUnhideAll}
                disabled={busy}
                className="cursor-pointer text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unhide all
              </button>
            )}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="cursor-pointer p-1.5 rounded hover:bg-surface-hover text-muted hover:text-body transition-colors"
              title="Close (Esc)"
              aria-label="Close hidden tags panel"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-auto">
          {items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-body-secondary text-center">
              No tag specs are currently hidden.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const def = item.def;
                const defId = def?.Id;
                const isUserCreated = defId ? !(originalDefinitionIds?.has(defId)) : false;
                const source = isUserCreated ? 'Frontend' : (defId ? (definitionSourceMap.get(defId) ?? null) : null);
                const versionInfo = defId ? definitionVersions.get(defId) : undefined;
                const certainty = def?.CertaintyLevelTag ?? 'HIGH';
                const badge = (
                  <TagBadge
                    tag={item.name}
                    certainty={certainty}
                    isUserCreated={isUserCreated}
                    version={versionInfo?.version}
                  />
                );
                return (
                  <li key={item.key} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      {source || def ? (
                        <Tooltip content={renderTagTooltip(source, def, false, versionInfo)} placement="right">
                          <span className="inline-block">{badge}</span>
                        </Tooltip>
                      ) : (
                        <span className="inline-block">{badge}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnhide(item.defId, item.name)}
                      disabled={busy}
                      className="cursor-pointer text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      Unhide
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
