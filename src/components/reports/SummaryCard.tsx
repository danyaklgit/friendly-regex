interface SummaryCardProps {
  lines: string[];
  onCopy: () => void;
  copyDisabled?: boolean;
}

/** The backend's SummaryLines, verbatim, so operators see exactly what Copy puts on the clipboard. */
export function SummaryCard({ lines, onCopy, copyDisabled }: SummaryCardProps) {
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3" aria-label="Summary">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Summary</h3>
        <button
          type="button"
          onClick={onCopy}
          disabled={copyDisabled}
          aria-label="Copy summary"
          title="Copy summary"
          className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded text-faint hover:text-heading hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
      {lines.length === 0 ? (
        <p className="text-[11px] text-muted">No summary for this range.</p>
      ) : (
        <div className="text-xs text-body whitespace-pre-wrap">
          {lines.map((line, i) => (line === '' ? <div key={i} data-summary-spacer className="h-2" /> : <p key={i}>{line}</p>))}
        </div>
      )}
    </section>
  );
}
