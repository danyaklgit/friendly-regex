/**
 * Parse a pasted LOV JSON payload into the fields the New-list modal holds,
 * plus the list's items for bulk creation — same paste-and-load pattern as
 * the tag / attribute JSON imports (`importTagJson` / `importAttributeJson`).
 *
 * Accepted shapes (superset, all fields optional unless noted):
 *   Flat:        { tag, nameEn, descEn, nameAr, descAr, items: [...] }
 *   Backend-ish: { Tag, Details: [{LanguageCode, Name, ShortDescription}], Items: [...] }
 *
 * Item shapes:
 *   Flat:        { value, tags?: string[] | string, nameEn, descEn, nameAr, descAr }
 *   Backend-ish: { Value, Tags?: string[], Details: [{LanguageCode, Name, ShortDescription}] }
 *
 * Rules mirror the manual form: the list tag + English name are required to
 * save (missing = warning, the operator fills them in); items without a value
 * are dropped with a warning; duplicate item values keep the first occurrence.
 * Only an unusable payload (bad JSON / nothing recognizable) is a hard error.
 */

export interface LovImportItem {
  value: string;
  /** Lookup tags; empty = backend defaults them to the value. */
  tags: string[];
  nameEn: string;
  descEn: string;
  nameAr: string;
  descAr: string;
}

export interface LovImportFields {
  tag: string;
  nameEn: string;
  descEn: string;
  nameAr: string;
  descAr: string;
  items: LovImportItem[];
}

export type LovImportResult =
  | { ok: true; fields: LovImportFields; warnings: string[] }
  | { ok: false; errors: string[] };

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function findDetail(p: Record<string, unknown>, lang: string): Record<string, unknown> | undefined {
  if (!Array.isArray(p.Details)) return undefined;
  return (p.Details as unknown[]).find(
    (d): d is Record<string, unknown> =>
      !!d && typeof d === 'object' && asString((d as Record<string, unknown>).LanguageCode).toLowerCase() === lang,
  );
}

function parseItem(raw: unknown, index: number, warnings: string[]): LovImportItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push(`Item ${index + 1}: not an object — skipped.`);
    return null;
  }
  const p = raw as Record<string, unknown>;
  const value = asString(p.value ?? p.Value).trim();
  if (!value) {
    warnings.push(`Item ${index + 1}: missing "value" — skipped.`);
    return null;
  }
  const rawTags = p.tags ?? p.Tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.map(asString).map((t) => t.trim()).filter((t) => t.length > 0)
    : asString(rawTags).split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 0);
  const dEn = findDetail(p, 'en');
  const dAr = findDetail(p, 'ar');
  return {
    value,
    tags,
    nameEn: asString(p.nameEn ?? p.name ?? dEn?.Name).trim(),
    descEn: asString(p.descEn ?? p.descriptionEn ?? dEn?.ShortDescription).trim(),
    nameAr: asString(p.nameAr ?? dAr?.Name).trim(),
    descAr: asString(p.descAr ?? p.descriptionAr ?? dAr?.ShortDescription).trim(),
  };
}

export function parseLovImport(text: string): LovImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Payload must be a JSON object.'] };
  }
  const p = raw as Record<string, unknown>;
  const warnings: string[] = [];

  const dEn = findDetail(p, 'en');
  const dAr = findDetail(p, 'ar');
  const tag = asString(p.tag ?? p.Tag).trim();
  const nameEn = asString(p.nameEn ?? p.name ?? dEn?.Name).trim();
  const descEn = asString(p.descEn ?? p.descriptionEn ?? dEn?.ShortDescription).trim();
  const nameAr = asString(p.nameAr ?? dAr?.Name).trim();
  const descAr = asString(p.descAr ?? p.descriptionAr ?? dAr?.ShortDescription).trim();

  const rawItems = p.items ?? p.Items;
  const items: LovImportItem[] = [];
  if (rawItems !== undefined) {
    if (!Array.isArray(rawItems)) {
      warnings.push('"items" is not an array — ignored.');
    } else {
      const seen = new Set<string>();
      rawItems.forEach((it, i) => {
        const parsed = parseItem(it, i, warnings);
        if (!parsed) return;
        const key = parsed.value.toLowerCase();
        if (seen.has(key)) {
          warnings.push(`Item ${i + 1}: duplicate value "${parsed.value}" — first occurrence kept.`);
          return;
        }
        seen.add(key);
        items.push(parsed);
      });
    }
  }

  if (!tag && !nameEn && !nameAr && items.length === 0) {
    return {
      ok: false,
      errors: ['No recognizable LOV fields found. Expected tag / nameEn / items[] (or Tag / Details[] / Items[]).'],
    };
  }

  if (!tag) warnings.push('List tag ("tag") is empty — required before creating.');
  if (!nameEn) warnings.push('English name ("nameEn") is empty — required before creating.');

  return { ok: true, fields: { tag, nameEn, descEn, nameAr, descAr, items }, warnings };
}
