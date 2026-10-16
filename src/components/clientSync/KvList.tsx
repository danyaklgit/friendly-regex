import { DASH } from '../../utils/clientSync/format';

export interface KvItem {
  key: string;
  value: string | null;
  isMandatory?: boolean;
  isValid?: boolean;
}

interface KvListProps {
  items: KvItem[];
  /** Keys to tint (step 4 highlights kb_* keys). */
  highlightKey?: (key: string) => boolean;
  emptyLabel?: string;
  /** Accessible name of the list. */
  label?: string;
}

/** Key and value rows with a mandatory dot and red invalid values (trace steps 2, 3 and 4). */
export function KvList({ items, highlightKey, emptyLabel = 'No attributes', label }: KvListProps) {
  if (items.length === 0) return <p className="text-xs text-muted">{emptyLabel}</p>;
  return (
    <dl role="list" aria-label={label} className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-y-px text-xs">
      {items.map((item, index) => {
        const invalid = item.isValid === false;
        const highlighted = highlightKey?.(item.key) ?? false;
        return (
          // One subgrid row per pair so the hover tint spans key and value together.
          <div key={`${item.key}-${index}`} className="col-span-2 grid grid-cols-subgrid gap-x-6 rounded px-1.5 py-0.5 hover:bg-surface-hover">
            <dt className={`max-w-[22rem] font-mono truncate ${highlighted ? 'text-primary-dark dark:text-primary' : 'text-body-secondary'}`} title={item.key}>
              {item.isMandatory && <span className="mr-1 text-primary" title="Mandatory" aria-label="mandatory">{'●'}</span>}
              {item.key}
            </dt>
            <dd className={`break-words text-left ${invalid ? 'text-red-600 dark:text-red-400' : 'text-body'}`} title={invalid ? 'Invalid value' : undefined} dir="auto">
              {item.value === null || item.value === '' ? <span className="text-muted">{DASH}</span> : item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
