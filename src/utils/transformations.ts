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

    // Find/Replace
    // Match-or-empty contract: when the transformation has no actionable
    // configuration (missing find/pattern) or when the find/pattern is set
    // but doesn't occur in the input, we return '' instead of the original
    // value. Operators expect "no result" to render as an empty cell, not
    // as the unchanged source field — leaking the source field reads as a
    // successful transformation and hides the configuration bug.
    case 'replace':
      if (!args.find) return '';
      if (!value.includes(args.find)) return '';
      return value.split(args.find).join(args.replaceWith ?? '');
    case 'regex_replace':
      if (!args.pattern) return '';
      try {
        const re = new RegExp(args.pattern, 'g');
        if (!re.test(value)) return '';
        // `test` advances lastIndex on /g regexes; rebuild a fresh regex so
        // the subsequent replace starts from the beginning of the string.
        return value.replace(new RegExp(args.pattern, 'g'), args.replaceWith ?? '');
      } catch {
        return '';
      }

    // Formatting
    case 'pad_left': {
      const len = Number(args.length);
      if (!(len > 0)) return '';
      return value.padStart(len, args.char || ' ');
    }
    case 'pad_right': {
      const len = Number(args.length);
      if (!(len > 0)) return '';
      return value.padEnd(len, args.char || ' ');
    }
    case 'date_reformat':
      return reformatDate(value, args.fromFormat ?? '', args.toFormat ?? '');

    // Extraction Refinement
    case 'substring': {
      const start = Number(args.start) || 0;
      const end = args.end ? Number(args.end) : undefined;
      return value.substring(start, end);
    }
    case 'split_and_pick': {
      if (!args.delimiter) return '';
      // JS quirk: `'abc'.split('x')` returns `['abc']`, so a `parts[0]`
      // lookup after a non-matching split would silently return the
      // ORIGINAL full string. Guard explicitly on the delimiter being
      // present so a no-match always reads as '' regardless of index.
      if (!value.includes(args.delimiter)) return '';
      const parts = value.split(args.delimiter);
      const idx = Number(args.index) || 0;
      return parts[idx] ?? '';
    }

    case 'max_char_limit': {
      const len = Number(args.length);
      if (!Number.isFinite(len) || len <= 0) return '';
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

/** Simple date reformatting for common patterns (MM/DD/YYYY <-> DD/MM/YYYY etc.).
 *  Returns '' (not the original value) when the inputs aren't usable —
 *  matches the match-or-empty contract enforced by `applyTransformation`. */
function reformatDate(value: string, fromFormat: string, toFormat: string): string {
  if (!fromFormat || !toFormat) return '';

  const fromParts = fromFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  const sep = fromFormat.match(/[/\-.]/)?.[0] ?? '/';
  const valueParts = value.split(/[/\-.]/);

  if (fromParts.length !== valueParts.length) return '';

  const dateMap: Record<string, string> = {};
  for (let i = 0; i < fromParts.length; i++) {
    dateMap[fromParts[i]] = valueParts[i];
  }

  const toSep = toFormat.match(/[/\-.]/)?.[0] ?? sep;
  const toParts = toFormat.split(/[/\-.]/).map((p) => p.toUpperCase());
  return toParts.map((p) => dateMap[p] ?? p).join(toSep);
}
