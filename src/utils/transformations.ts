import type { TransformationFormValue } from '../types';
import { isCompleteTransformation } from './attributeFingerprint';

export function applyTransformation(
  method: string,
  args: Record<string, string>,
  value: string,
): string {
  switch (method) {
    // Text Case
    case 'to_uppercase':
      return value.toUpperCase();
    case 'to_lowercase':
      return value.toLowerCase();
    case 'to_sentence_case':
      return value
        .toLowerCase()
        .replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    case 'to_title_case':
      return value
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // Trimming
    case 'trim':
      return value.trim();
    case 'trim_left':
      return value.trimStart();
    case 'trim_right':
      return value.trimEnd();
    case 'collapse_whitespace':
      return value.replace(/\s+/g, ' ').trim();
    // Collapse runs of 2+ literal spaces into a single space. Unlike
    // `collapse_whitespace`, it leaves tabs/newlines untouched and does NOT
    // trim the ends — it only normalizes interior space padding.
    case 'collapse_spaces':
      return value.replace(/ {2,}/g, ' ');

    // Removal
    case 'remove_alpha':
      return value.replace(/[a-zA-Z]/g, '');
    case 'remove_numeric':
      return value.replace(/\d/g, '');
    case 'remove_non_numeric':
      return value.replace(/[^\d]/g, '');
    case 'remove_special_chars':
      return value.replace(/[^a-zA-Z0-9\s]/g, '');
    // Strips every whitespace character: ASCII space, tab, CR, LF, plus
    // any Unicode whitespace (NBSP, ZWSP, etc.) that operators sometimes
    // see when extracting from copy-pasted source data.
    case 'remove_spaces_and_line_breaks':
      return value.replace(/\s/g, '');

    // Find/Replace
    case 'replace':
      return args.find ? value.split(args.find).join(args.replaceWith ?? '') : value;
    case 'regex_replace':
      try {
        return args.pattern
          ? value.replace(new RegExp(args.pattern, 'g'), args.replaceWith ?? '')
          : value;
      } catch {
        return value;
      }
    // No-op semantics on miss/empty (same contract as `replace`): if the
    // prefix/suffix is missing or doesn't match, the original value is
    // returned unchanged. Both methods are case-sensitive, mirroring JS's
    // built-in `String.prototype.startsWith` / `endsWith`.
    case 'starts_with_and_replace': {
      const prefix = args.prefix;
      if (!prefix) return value;
      if (!value.startsWith(prefix)) return value;
      return (args.replaceWith ?? '') + value.slice(prefix.length);
    }
    case 'ends_with_and_replace': {
      const suffix = args.suffix;
      if (!suffix) return value;
      if (!value.endsWith(suffix)) return value;
      return value.slice(0, value.length - suffix.length) + (args.replaceWith ?? '');
    }

    // Formatting
    case 'pad_left': {
      const len = Number(args.length);
      return len > 0 ? value.padStart(len, args.char || ' ') : value;
    }
    case 'pad_right': {
      const len = Number(args.length);
      return len > 0 ? value.padEnd(len, args.char || ' ') : value;
    }
    case 'date_reformat':
      return reformatDate(value, args.fromFormat ?? '', args.toFormat ?? '');
    // No-op when no text is supplied — same contract as `replace`/`pad_*`:
    // a missing argument yields the original value rather than concatenating
    // `undefined` or the empty string.
    case 'add_to_start':
      return args.text ? args.text + value : value;
    case 'append_at_end':
      return args.text ? value + args.text : value;

    // Extraction Refinement
    case 'substring': {
      // `start` is a required arg — a missing value used to silently
      // coerce to 0 (and produce a full-string "result") which surfaced
      // as a misleading live preview. Require an explicit non-empty
      // value before applying; otherwise pass the input through
      // unchanged. The save gate (isCompleteAttribute) already blocks
      // persistence of this state, so this is purely defensive for the
      // in-builder display.
      if (args.start == null || args.start === '') return value;
      const start = Number(args.start) || 0;
      const end = args.end ? Number(args.end) : undefined;
      return value.substring(start, end);
    }
    case 'split_and_pick': {
      // Strict match-or-empty contract — `split_and_pick`'s whole purpose
      // is locating the delimiter, so a no-match is a failure (not a
      // no-op). Returning the original would silently leak the source
      // field for every row that doesn't contain the delimiter. Note: JS
      // `'abc'.split('x')` returns `['abc']`, so a naive `parts[0]` lookup
      // after a non-matching split would have leaked the full string at
      // index 0 — the explicit `includes` guard prevents that.
      // Both delimiter AND index are required; without an explicit index
      // the old code defaulted to 0 and produced a real-looking result
      // even when the operator hadn't picked one yet. Treat the missing
      // index as "not configured" and pass the input through unchanged.
      if (!args.delimiter) return '';
      if (args.index == null || args.index === '') return value;
      if (!value.includes(args.delimiter)) return '';
      const parts = value.split(args.delimiter);
      const idx = Number(args.index) || 0;
      return parts[idx] ?? '';
    }

    // Take the leading N characters. Mirror of `extract_last_n_chars`
    // (the EXTRACTION op) but applied as a post-extraction transformation
    // so a longer extraction can be cropped to a fixed-length leading
    // window. Length <= 0 produces an empty string; N >= value.length
    // passes the value through (slice clamps naturally).
    case 'take_first_n_chars': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return '';
      return value.slice(0, len);
    }

    // Take the trailing N characters — symmetric counterpart.
    case 'take_last_n_chars': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return '';
      return value.slice(Math.max(0, value.length - len));
    }

    // Drop the leading N characters and keep the remainder. Length <= 0
    // returns the value unchanged (nothing to drop); N >= value.length
    // returns the empty string (everything was dropped). Mirror of
    // take_first_n_chars semantically — together they partition the
    // string at position N.
    case 'remove_first_n_chars': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return value;
      return value.slice(len);
    }

    // Drop the trailing N characters and keep the prefix. Symmetric
    // counterpart of remove_first_n_chars.
    case 'remove_last_n_chars': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return value;
      return value.slice(0, Math.max(0, value.length - len));
    }

    case 'max_char_limit': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return value;
      const breakAtSpecial = args.breakAtSpecial === 'true';
      if (!breakAtSpecial) return value.slice(0, len);
      // Walk the first `len` chars; cut at the first non-alphanumeric
      // (space, slash, dash, comma, etc.) encountered before the cap.
      const limit = Math.min(len, value.length);
      for (let i = 0; i < limit; i++) {
        if (!/[a-zA-Z0-9]/.test(value[i])) {
          return value.slice(0, i);
        }
      }
      return value.slice(0, limit);
    }

    // Collapses a value that is two byte-identical uppercase-alphanumeric
    // halves into one — used to clean fields like "ABC123ABC123" → "ABC123"
    // where the source data accidentally double-prints the same identifier.
    // No-op when the value isn't a perfect doubled pair, so it composes
    // cleanly with longer pipelines on rows that don't carry duplicates.
    case 'dedupe':
      return value.replace(/^([A-Z0-9]+)\1$/, '$1');

    // Strips leading zero padding from a numeric string, keeping at least
    // one digit so "0000" → "0" (rather than empty). Useful for account
    // numbers / reference ids the bank zero-pads on the wire but the
    // operator wants to surface unpadded.
    case 'remove_leading_zeros':
      return value.replace(/^0+(\d)/, '$1');

    default:
      return value;
  }
}

export interface TransformationStep {
  index: number;
  method: string;
  label: string;
  result: string;
}

export function applyTransformationPipeline(
  transformations: TransformationFormValue[],
  value: string,
): TransformationStep[] {
  const steps: TransformationStep[] = [];
  let current = value;
  for (let i = 0; i < transformations.length; i++) {
    const t = transformations[i];
    // Stop at the first transformation with missing required args so the
    // preview never shows a misleading result for an unfinished row
    // (e.g. Split & Pick with an empty index would otherwise default to
    // 0 and surface a real-looking output). Subsequent steps are dropped
    // too — running them on a not-yet-defined input would compound the
    // misleading state.
    if (!isCompleteTransformation(t)) break;
    current = applyTransformation(t.method, t.args, current);
    steps.push({ index: i, method: t.method, label: t.method, result: current });
  }
  return steps;
}

/** Simple date reformatting for common patterns (MM/DD/YYYY <-> DD/MM/YYYY etc.) */
function reformatDate(value: string, fromFormat: string, toFormat: string): string {
  if (!fromFormat || !toFormat) return value;

  // Strip an ISO datetime time portion before splitting. The transformation
  // pipeline routinely sees `YYYY-MM-DDT00:00:00Z`-shaped values after the
  // Validity ISO lift and from any backend field that stores dates as
  // datetimes. Without this strip the trailing `T00:00:00Z` rides along on
  // the final segment, so reformatting `2023-11-23T00:00:00Z` with
  // `YYYY-MM-DD` → `DD-MM-YYYY` produced `23T00:00:00Z-11-2023` instead of
  // `23-11-2023`.
  const cleanValue = value.includes('T') ? value.split('T')[0] : value;

  const fromParts = fromFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  const sep = fromFormat.match(/[/\-.]/)?.[0] ?? '/';
  const valueParts = cleanValue.split(/[/\-.]/);

  if (fromParts.length !== valueParts.length) return value;

  const dateMap: Record<string, string> = {};
  for (let i = 0; i < fromParts.length; i++) {
    dateMap[fromParts[i]] = valueParts[i];
  }

  const toSep = toFormat.match(/[/\-.]/)?.[0] ?? sep;
  const toParts = toFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  return toParts.map((p) => dateMap[p] ?? p).join(toSep);
}
