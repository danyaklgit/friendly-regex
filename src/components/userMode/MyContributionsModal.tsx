import { useContext, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { useUserMode } from '../../context/UserModeContext';
import { TagSpecContext } from '../../context/TagSpecContext';
import { buildTagDisplayNameMap, tagDisplayName } from '../../utils/userMode/tagDisplayName';
import type { Contribution } from '../../utils/userMode/contributionStorage';

interface MyContributionsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The "My Contributions" log. Lists every tag change the current user has made
 * (per-user storage), with a Revert action that removes the entry and restores
 * the original displayed tag on the underlying row.
 *
 * Status is always `Applied` for now — without a backend there's no review
 * pipeline to surface a Pending state. The SaveType column distinguishes the
 * two paths the user took at the contribution dialog.
 */
export function MyContributionsModal({ open, onClose }: MyContributionsModalProps) {
  const { contributions, revertContribution } = useUserMode();
  // Nullable-safe: outside a TagSpecProvider the map is empty and tags fall
  // back to their raw code.
  const tagSpecs = useContext(TagSpecContext);
  const tagNames = useMemo(() => buildTagDisplayNameMap(tagSpecs?.tagsHierarchy ?? []), [tagSpecs]);

  const sorted = useMemo(
    () => [...contributions].sort((a, b) => b.contributionDate.localeCompare(a.contributionDate)),
    [contributions],
  );

  return (
    <Modal open={open} onClose={onClose} title="My Contributions" fullHeight widthClass="max-w-full">
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary text-[10px] uppercase tracking-wide text-muted">
              <tr>
                <Th>Reference</Th>
                <Th>Tag</Th>
                <Th>Parent Groups</Th>
                <Th>Status</Th>
                <Th>Save Type</Th>
                <Th>Reason</Th>
                <Th>Contribution Date</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sorted.map((c) => (
                <Row key={c.transactionId + c.contributionDate} contribution={c} tagNames={tagNames} onRevert={() => revertContribution(c.transactionId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-8 text-center">
      <p className="text-sm text-body">You haven't made any contributions yet.</p>
      <p className="text-xs text-muted mt-1">Click a tag in the table and choose a new value to get started.</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function Row({ contribution, tagNames, onRevert }: { contribution: Contribution; tagNames: Map<string, string>; onRevert: () => void }) {
  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <Td>
        <div className="font-mono text-[11px]">{contribution.bankReference || '—'}</div>
        <div className="text-[11px] text-muted">{formatIsoDate(contribution.entryDate)}</div>
      </Td>
      <Td>
        <div className="flex items-baseline gap-1">
          <span className="text-muted">From:</span>
          <span className="line-through text-faint">{contribution.originalTag ? tagDisplayName(tagNames, contribution.originalTag) : '—'}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-muted">To:</span>
          <span className="text-body">{tagDisplayName(tagNames, contribution.newTag)}</span>
          {contribution.newTagIsCustom && (
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary-dark dark:text-primary-light px-1.5 py-0.5 text-[10px] font-medium">
              Custom
            </span>
          )}
        </div>
      </Td>
      <Td>
        <div className="flex items-baseline gap-1">
          <span className="text-muted">From:</span>
          <span className="line-through text-faint">
            {contribution.originalGroups.length > 0 ? contribution.originalGroups.join(', ') : '—'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-muted">To:</span>
          <span className="text-body">
            {contribution.newGroups.length > 0 ? contribution.newGroups.join(', ') : <span className="text-faint">custom</span>}
          </span>
        </div>
      </Td>
      <Td>
        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-medium">
          Applied
        </span>
      </Td>
      <Td>
        {contribution.saveType === 'self' ? (
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">
            Saved for Self
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 text-[10px] font-medium">
            Submitted for Review
          </span>
        )}
      </Td>
      <Td>
        {contribution.reason ? (
          <span className="text-body line-clamp-2 max-w-60 inline-block">{contribution.reason}</span>
        ) : (
          <span className="italic text-faint">No reason provided</span>
        )}
      </Td>
      <Td className="whitespace-nowrap text-body-secondary">{formatIsoDateTime(contribution.contributionDate)}</Td>
      <Td>
        <button
          type="button"
          onClick={onRevert}
          className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-rose-300 hover:underline"
          title="Discard this contribution and restore the original tag"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Revert
        </button>
      </Td>
    </tr>
  );
}

function formatIsoDate(raw: string): string {
  if (!raw) return '';
  const iso = raw.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function formatIsoDateTime(raw: string): string {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}
