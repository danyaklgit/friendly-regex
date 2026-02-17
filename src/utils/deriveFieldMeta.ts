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

/** Fields that should always appear first, in this exact order (if present in the data). */
const PRIORITY_FIELDS = [
  'BankSwiftCode',
  'IBAN',
  'EntryDate',
  'Side',
  'TransactionTypeCode',
  'Amount',
];

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
  const remaining = Array.from(allKeys)
    .filter((key) => !excluded.has(key))
    .sort();

  const prioritySet = new Set(PRIORITY_FIELDS);
  const dataFields = [
    ...PRIORITY_FIELDS.filter((f) => remaining.includes(f)),
    ...remaining.filter((f) => !prioritySet.has(f)),
  ];

  return {
    identifierField,
    dataFields,
    sourceFields: dataFields,
  };
}
