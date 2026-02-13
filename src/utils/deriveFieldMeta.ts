export interface FieldMeta {
  /** The key used as the row identifier (e.g. "_id", "Identifier", or "Name") */
  identifierField: string;
  /** All displayable data columns, excluding the identifier and skip-list fields */
  dataFields: string[];
  /** Fields available in Source Field dropdowns (same as dataFields) */
  sourceFields: string[];
}

const SKIP_FIELDS = new Set([
  'FMSId',
  'Hash',
  'IsDeadEnd',
  'TagSpecId',
  'Version',
  'Tag',
  'CertaintyLevel',
  'Attributes',
  'MultiTags',
  'ExtractionCompletness',
]);

const IDENTIFIER_CANDIDATES = ['_id', 'Identifier', 'Name'];

export function deriveFieldMeta(rows: Record<string, unknown>[]): FieldMeta {
  const allKeys = new Set<string>();
  const objectKeys = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      allKeys.add(key);
      if (value !== null && typeof value === 'object') {
        objectKeys.add(key);
      }
    }
  }

  let identifierField = IDENTIFIER_CANDIDATES[0];
  for (const candidate of IDENTIFIER_CANDIDATES) {
    if (allKeys.has(candidate)) {
      identifierField = candidate;
      break;
    }
  }

  const excluded = new Set([...SKIP_FIELDS, ...objectKeys, identifierField]);
  const dataFields = Array.from(allKeys)
    .filter((key) => !excluded.has(key))
    .sort();

  return {
    identifierField,
    dataFields,
    sourceFields: dataFields,
  };
}
