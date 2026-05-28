import type { TransformationFormValue } from '../types';

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
      if (!args.delimiter) return '';
      if (!value.includes(args.delimiter)) return '';
      const parts = value.split(args.delimiter);
      const idx = Number(args.index) || 0;
      return parts[idx] ?? '';
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
    current = applyTransformation(t.method, t.args, current);
    steps.push({ index: i, method: t.method, label: t.method, result: current });
  }
  return steps;
}

/** Simple date reformatting for common patterns (MM/DD/YYYY <-> DD/MM/YYYY etc.) */
function reformatDate(value: string, fromFormat: string, toFormat: string): string {
  if (!fromFormat || !toFormat) return value;

  const fromParts = fromFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  const sep = fromFormat.match(/[/\-.]/)?.[0] ?? '/';
  const valueParts = value.split(/[/\-.]/);

  if (fromParts.length !== valueParts.length) return value;

  const dateMap: Record<string, string> = {};
  for (let i = 0; i < fromParts.length; i++) {
    dateMap[fromParts[i]] = valueParts[i];
  }

  const toSep = toFormat.match(/[/\-.]/)?.[0] ?? sep;
  const toParts = toFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  return toParts.map((p) => dateMap[p] ?? p).join(toSep);
}
