import { Fragment } from 'react';
import type { KeyToken, KeyTokenField } from '../../api/sampling';
import { KEY_FIELD_LABELS, tokenChipClass, tokenCode, tokenPhrase } from '../../utils/keyTokens';

interface KeyTokenChipsProps {
  tokens: KeyToken[];
  /** Chip click → editing popover; the element anchors it. Absent = read-only. */
  onChipClick?: (index: number, el: HTMLElement) => void;
  /** Highlight the chip whose menu is open (adds a caret). */
  selectedIndex?: number | null;
  size?: 'xs' | 'sm';
}

/**
 * The matching key rendered as chips (Curated View matching keys,
 * 2026-09-07), matching the operator brief: an `AI=>` field prefix, literal
 * chips as their exact words, placeholder/list chips as `<BANKS>` /
 * `<CARD_TYPES:Visa>` codes — colored by kind, the same treatment in the
 * drawer, the key-rules list, and previews. A Glued chip renders flush
 * against the previous one (`ORD//<NAME>`). Rendered from `KeyTokens[]`,
 * never by parsing the anchor string.
 */
export function KeyTokenChips({ tokens, onChipClick, selectedIndex, size = 'sm' }: KeyTokenChipsProps) {
  if (tokens.length === 0) return null;

  // Group indices by field, preserving order (a key may span AI and D2).
  const fields: KeyTokenField[] = [];
  const byField = new Map<KeyTokenField, number[]>();
  tokens.forEach((t, i) => {
    let arr = byField.get(t.Field);
    if (!arr) {
      arr = [];
      byField.set(t.Field, arr);
      fields.push(t.Field);
    }
    arr.push(i);
  });

  const chipPad = size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <div className="space-y-1.5">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-y-1.5 flex-wrap min-w-0">
          <span
            className="text-[11px] font-mono text-faint mr-2 shrink-0 select-none"
            title={KEY_FIELD_LABELS[field]}
          >
            {field}=&gt;
          </span>
          {(byField.get(field) ?? []).map((i, posInField) => {
            const t = tokens[i];
            const selected = selectedIndex === i;
            const glued = (t.Glued ?? false) && posInField > 0;
            const chip = (
              <span
                dir="auto"
                title={t.Kind === 'List' ? `${tokenPhrase(t)} (from the ${t.Text} list)` : t.Kind === 'Placeholder' ? tokenPhrase(t) : undefined}
                className={`inline-flex items-center gap-1 rounded-md border font-mono whitespace-pre max-w-full overflow-hidden text-ellipsis ${chipPad} ${tokenChipClass(t)} ${
                  onChipClick ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : ''
                } ${selected ? 'ring-2 ring-primary' : ''}`}
              >
                {tokenCode(t)}
                {selected && (
                  <svg className="w-2.5 h-2.5 shrink-0 opacity-80" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </span>
            );
            return (
              <Fragment key={i}>
                {/* Spacing between chips carries meaning: glued = no space. */}
                {!glued && posInField > 0 && <span className="w-1.5" aria-hidden />}
                {onChipClick ? (
                  <button
                    type="button"
                    onClick={(e) => onChipClick(i, e.currentTarget)}
                    className="inline-flex max-w-full min-w-0 cursor-pointer"
                    aria-label={`Edit key part: ${tokenCode(t)}`}
                    aria-expanded={selected}
                  >
                    {chip}
                  </button>
                ) : (
                  chip
                )}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
