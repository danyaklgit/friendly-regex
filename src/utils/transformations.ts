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

    // Extraction Refinement
    case 'substring': {
      const start = Number(args.start) || 0;
      const end = args.end ? Number(args.end) : undefined;
      return value.substring(start, end);
    }
    case 'split_and_pick': {
      if (!args.delimiter) return value;
      const parts = value.split(args.delimiter);
      const idx = Number(args.index) || 0;
      return parts[idx] ?? '';
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
