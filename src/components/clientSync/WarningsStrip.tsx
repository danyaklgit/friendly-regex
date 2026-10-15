import type { ClientSyncShow, ClientSyncWarning } from '../../api/clientSync';
import { warningTone } from '../../utils/clientSync/status';
import { groupIban } from '../../utils/clientSync/format';

interface WarningsStripProps {
  warnings: ClientSyncWarning[];
  onShow: (show: ClientSyncShow) => void;
}

const ROW_TONE: Record<'warning' | 'info', string> = {
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100',
  info: 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-900/20 dark:text-cyan-100',
};

/** One row per backend warning (spec 7.2). A row with a Show value is a button that filters the list. */
export function WarningsStrip({ warnings, onShow }: WarningsStripProps) {
  if (warnings.length === 0) return null;
  return (
    <div role="region" aria-label="Warnings" className="space-y-1.5">
      {warnings.map((w, index) => {
        const className = `flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs ${ROW_TONE[warningTone(w.Level)]}`;
        const body = (
          <>
            <code className="shrink-0 rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold">{w.Code}</code>
            <span className="min-w-0 flex-1">{w.Message}</span>
            {w.IBAN && <span className="shrink-0 font-mono text-[10px] opacity-80">{groupIban(w.IBAN)}</span>}
            {w.Count !== null && <span className="shrink-0 text-[10px] font-semibold tabular-nums">{w.Count}</span>}
          </>
        );
        const key = `${w.Code}-${w.IBAN ?? ''}-${index}`;
        const show = w.Show;
        return show ? (
          <button key={key} type="button" title="Show these rows" onClick={() => onShow(show)} className={`${className} cursor-pointer hover:brightness-95`}>
            {body}
          </button>
        ) : (
          <div key={key} className={className}>{body}</div>
        );
      })}
    </div>
  );
}
