import { Fragment } from 'react';
import type { KeyToken, KeyTokenField } from '../../api/sampling';
import { KEY_FIELD_LABELS, tokenChipClass, tokenPhrase } from '../../utils/keyTokens';

interface KeyTokenChipsProps {
  tokens: KeyToken[];
  /** Chip click → editing menu. Absent = read-only chips. */
  onChipClick?: (index: number) => void;
  /** Highlight the chip whose menu is open. */
  selectedIndex?: number | null;
  size?: 'xs' | 'sm';
}

/**
 * The matching key rendered as chips (Curated View matching keys,
 * 2026-09-07): plain words and typed placeholders, colored by kind — the
 * same treatment in the drawer, the key-rules list, and previews. Chips are
 * grouped per field with the field's label; a Glued chip renders flush
 * against the previous one (no gap — `ORD//<NAME>`). Rendered from
 * `KeyTokens[]`, never by parsing the anchor string.
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

  const chipPad = size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]';

  return (
    <div className="space-y-1.5">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-y-1 flex-wrap min-w-0">
          <span
            className="text-[9px] font-semibold uppercase tracking-wider text-faint mr-1.5 shrink-0"
            title={KEY_FIELD_LABELS[field]}
          >
            {field}
          </span>
          {(byField.get(field) ?? []).map((i, posInField) => {
            const t = tokens[i];
            const phrase = tokenPhrase(t);
            const isPlaceholder = t.Kind !== 'Literal';
            const glued = (t.Glued ?? false) && posInField > 0;
            const chip = (
              <span
                dir="auto"
                title={
                  t.Kind === 'List'
                    ? `${t.Text}${t.Item ? `: ${t.Item}` : ''} (LOV list)`
                    : t.Kind === 'Placeholder'
                      ? `<${t.Text}>`
                      : undefined
                }
                className={`inline-flex items-center rounded border font-medium whitespace-pre max-w-full overflow-hidden text-ellipsis ${chipPad} ${tokenChipClass(t)} ${
                  isPlaceholder ? 'italic' : 'font-mono'
                } ${onChipClick ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : ''} ${
                  selectedIndex === i ? 'ring-2 ring-primary' : ''
                }`}
              >
                {phrase}
              </span>
            );
            return (
              <Fragment key={i}>
                {/* Spacing between chips carries meaning: glued = no space. */}
                {!glued && posInField > 0 && <span className="w-1" aria-hidden />}
                {onChipClick ? (
                  <button
                    type="button"
                    onClick={() => onChipClick(i)}
                    className="inline-flex max-w-full min-w-0 cursor-pointer"
                    aria-label={`Edit key part: ${phrase}`}
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
