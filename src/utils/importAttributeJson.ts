/**
 * Parse a pasted attribute JSON payload into the fields the Create Attribute
 * modal (`AttributeFormModal`) holds. The attribute `Value` is NOT taken from
 * the payload: the modal auto-derives it (PascalCase of the English name), so
 * the payload only carries the human-facing fields.
 *
 * Two shapes are accepted (superset):
 *   - Flat: { nameEn, shortDescEn, nameAr, shortDescAr, possibleLovTag? }
 *   - Backend-ish: { PossibleLOVTag?, Details: [ { LanguageCode, Name, ShortDescription }, … ] }
 *
 * Missing required fields (all four names/descriptions are required to save)
 * are warnings, not errors — the modal populates what's provided and the
 * operator fills the rest. Only an unusable payload (bad JSON, no recognizable
 * fields) is a hard error.
 */

export interface AttributeImportFields {
  nameEn: string;
  shortDescEn: string;
  nameAr: string;
  shortDescAr: string;
  possibleLovTag: string;
}

export type AttributeImportResult =
  | { ok: true; fields: AttributeImportFields; warnings: string[] }
  | { ok: false; errors: string[] };

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

export function parseAttributeImport(text: string): AttributeImportResult {
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

  // Optional backend-shaped Details array.
  const findDetail = (lang: string): Record<string, unknown> | undefined => {
    if (!Array.isArray(p.Details)) return undefined;
    return (p.Details as unknown[]).find(
      (d): d is Record<string, unknown> =>
        !!d && typeof d === 'object' && asString((d as Record<string, unknown>).LanguageCode).toLowerCase() === lang,
    );
  };
  const dEn = findDetail('en');
  const dAr = findDetail('ar');

  const nameEn = asString(p.nameEn ?? p.name ?? dEn?.Name);
  const shortDescEn = asString(p.shortDescEn ?? p.descriptionEn ?? p.shortDescription ?? dEn?.ShortDescription);
  const nameAr = asString(p.nameAr ?? dAr?.Name);
  const shortDescAr = asString(p.shortDescAr ?? p.descriptionAr ?? dAr?.ShortDescription);
  const possibleLovTag = asString(p.possibleLovTag ?? p.PossibleLOVTag);

  if (!nameEn && !shortDescEn && !nameAr && !shortDescAr && !possibleLovTag) {
    return {
      ok: false,
      errors: ['No recognizable attribute fields found. Expected nameEn / shortDescEn / nameAr / shortDescAr (or a Details[] array).'],
    };
  }

  const warnings: string[] = [];
  if (!nameEn) warnings.push('English name (nameEn) is empty — required before saving.');
  if (!shortDescEn) warnings.push('English short description (shortDescEn) is empty — required before saving.');
  if (!nameAr) warnings.push('Arabic name (nameAr) is empty — required before saving.');
  if (!shortDescAr) warnings.push('Arabic short description (shortDescAr) is empty — required before saving.');

  return { ok: true, fields: { nameEn, shortDescEn, nameAr, shortDescAr, possibleLovTag }, warnings };
}
