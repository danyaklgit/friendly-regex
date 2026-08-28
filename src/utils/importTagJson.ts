/**
 * Parse a pasted tag JSON payload into the fields the "Create New Tag" modal
 * (`TagEditModal`, Settings, Tags Hierarchy) holds. Mirrors that form:
 *
 *   - `tag`         the Tag Code (the only field required to save)
 *   - `level`       'T' (tag) or 'G' (group); default 'T'
 *   - English / Arabic Name + Description
 *   - `parentTag`   (level 'T' only) a parent leaf's Tag Code
 *   - `groups`      (level 'T' only) group Tag Codes (or their display names,
 *                   resolved by the modal against the known groups)
 *
 * Two shapes are accepted (superset): flat fields, or a backend-ish
 * `Details: [{ LanguageCode, Name, Description }, …]` array. Missing pieces are
 * warnings, not errors (the modal fills the form and the operator completes it);
 * only an unusable payload is a hard error.
 */

export interface TagImportFields {
  tag: string;
  level: 'G' | 'T';
  nameEn: string;
  descriptionEn: string;
  nameAr: string;
  descriptionAr: string;
  parentTag: string;
  groups: string[];
}

export type TagImportResult =
  | { ok: true; fields: TagImportFields; warnings: string[] }
  | { ok: false; errors: string[] };

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

export function parseTagImport(text: string): TagImportResult {
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
  const errors: string[] = [];
  const warnings: string[] = [];

  const findDetail = (lang: string): Record<string, unknown> | undefined => {
    if (!Array.isArray(p.Details)) return undefined;
    return (p.Details as unknown[]).find(
      (d): d is Record<string, unknown> =>
        !!d && typeof d === 'object' && asString((d as Record<string, unknown>).LanguageCode).toLowerCase() === lang,
    );
  };
  const dEn = findDetail('en');
  const dAr = findDetail('ar');

  const tag = asString(p.tag ?? p.Tag);
  const nameEn = asString(p.nameEn ?? p.name ?? dEn?.Name);
  const descriptionEn = asString(p.descriptionEn ?? p.description ?? dEn?.Description);
  const nameAr = asString(p.nameAr ?? dAr?.Name);
  const descriptionAr = asString(p.descriptionAr ?? dAr?.Description);
  const parentTag = asString(p.parentTag ?? p.ParentTag);

  // level: 'G' | 'T', case-insensitive, default 'T'.
  let level: 'G' | 'T' = 'T';
  const rawLevel = p.level ?? p.Level;
  if (rawLevel != null && rawLevel !== '') {
    const s = asString(rawLevel).toUpperCase();
    if (s === 'G' || s === 'T') level = s;
    else errors.push(`level: "${asString(rawLevel)}" must be "T" (tag) or "G" (group).`);
  }

  const groupsRaw = p.groups ?? p.GroupTags;
  const groups = Array.isArray(groupsRaw) ? groupsRaw.map((g) => asString(g)).filter((s) => s !== '') : [];

  if (!tag && !nameEn && !nameAr && groups.length === 0) {
    return {
      ok: false,
      errors: ['No recognizable tag fields found. Expected at least a "tag" (Tag Code) or names/groups.'],
    };
  }
  if (errors.length > 0) return { ok: false, errors };

  if (!tag) warnings.push('tag (Tag Code) is empty — required before saving.');
  if (level === 'G' && (parentTag || groups.length > 0)) {
    warnings.push('parentTag / groups are ignored for a group (level "G").');
  }

  return { ok: true, fields: { tag, level, nameEn, descriptionEn, nameAr, descriptionAr, parentTag, groups }, warnings };
}
