/**
 * Per-DataSetType column specification for the Transactions table, from
 * docs/Transactions-Column-Spec.md (Rule 2).
 *
 * Column identity is the table column KEY: `data:<Field>` for API fields plus
 * the synthetic `__debit` / `__credit` pair (Side+Amount always collapse into
 * it; there are no raw Side/Amount columns). The Tags column is implicit and
 * always first — it never appears in these lists.
 *
 * Display names are NOT specified here: they derive mechanically from the
 * field name via humanizeFieldName (Rule 1).
 *
 * For each DataSetType:
 *  - `defaultOrder`: canonical order of every offerable column (visible AND
 *    hidden-by-default, so a toggled-on column lands in a sensible spot).
 *  - `defaultVisible`: the subset visible on first load (no saved preference).
 *  - `neverShow`: fields never populated on this type — excluded from the
 *    picker and the table entirely, even if a stale saved preference or the
 *    row payload carries them.
 *
 * A field in the data but in none of these lists (a future backend addition)
 * is hidden-but-offerable: it shows in the picker (after the ordered keys),
 * never by default. That behavior falls out of the consumers, not this file.
 */

const k = (field: string) => `data:${field}`;

export interface DataSetColumnSpec {
  defaultOrder: readonly string[];
  defaultVisible: ReadonlySet<string>;
  neverShow: ReadonlySet<string>;
}

/** Fields only ever populated on Ledger rows — never offered elsewhere. */
const LEDGER_ONLY_FIELDS = [
  'ClientCode', 'ErpCode', 'TxnTypeName', 'EntryId',
  'AccountId', 'AccountName', 'AccountNumber', 'AccountType',
  'BankName', 'PartyId', 'PartyName',
  'OffsetAccountName', 'OffsetAccountId', 'OffsetAccountNumber', 'OffsetAccountType',
  'AmountFcy', 'IsStale', 'StaleSinceUtc',
] as const;

const LEDGER_ONLY_KEYS = LEDGER_ONLY_FIELDS.map(k);

// MT940 (also covers TransactionsList rows if that type joins the MT940
// workspace later). Hidden-by-default columns sit at their canonical spot in
// the order; the default view ends with StatementId then Comment.
const MT940_ORDER = [
  k('Sequence'),
  k('BankSwiftCode'),           // hidden by default
  k('IBAN'),
  k('StatementDate'),
  k('EntryDate'),               // hidden by default
  k('ValueDate'),
  '__debit',
  '__credit',
  k('CurrencyCode'),
  k('RunningBalance'),
  k('FundsCode'),               // hidden by default
  k('TransactionStatusIndicator'), // hidden by default
  k('BankReference'),
  k('Description1'),
  k('TransactionTypeCode'),
  k('Description2'),
  k('AdditionalInformation'),
  k('TransactionDetails'),
  k('Hash'),                    // hidden by default
  k('StatementId'),
  k('Comment'),
];

const MT940_VISIBLE = new Set([
  k('Sequence'),
  k('IBAN'),
  k('StatementDate'),
  k('ValueDate'),
  '__debit',
  '__credit',
  k('CurrencyCode'),
  k('RunningBalance'),
  k('BankReference'),
  k('Description1'),
  k('TransactionTypeCode'),
  k('Description2'),
  k('AdditionalInformation'),
  k('TransactionDetails'),
  k('StatementId'),
  k('Comment'),
]);

const MT940_SPEC: DataSetColumnSpec = {
  defaultOrder: MT940_ORDER,
  defaultVisible: MT940_VISIBLE,
  neverShow: new Set(LEDGER_ONLY_KEYS),
};

// MT942 (intraday): RunningBalance is never populated — hide it entirely.
const MT942_SPEC: DataSetColumnSpec = {
  defaultOrder: MT940_ORDER.filter((key) => key !== k('RunningBalance')),
  defaultVisible: new Set([...MT940_VISIBLE].filter((key) => key !== k('RunningBalance'))),
  neverShow: new Set([...LEDGER_ONLY_KEYS, k('RunningBalance')]),
};

// INTERIM_MT940 (intraday): RunningBalance available but hidden by default.
const INTERIM_MT940_SPEC: DataSetColumnSpec = {
  defaultOrder: MT940_ORDER,
  defaultVisible: new Set([...MT940_VISIBLE].filter((key) => key !== k('RunningBalance'))),
  neverShow: new Set(LEDGER_ONLY_KEYS),
};

// Ledger (ERP): every Ledger-only field default-visible except the stale pair.
// Grouped account → amounts → offset → party → narrative → identity.
const LEDGER_ORDER = [
  k('StatementId'),
  k('StatementDate'),
  k('Sequence'),                // hidden by default
  k('ValueDate'),               // hidden by default
  k('EntryDate'),               // hidden by default
  k('AccountName'),
  k('AccountNumber'),
  k('IBAN'),                    // hidden by default
  k('AccountType'),
  k('AccountId'),
  k('BankName'),
  '__debit',
  '__credit',
  k('CurrencyCode'),
  k('AmountFcy'),
  k('RunningBalance'),
  k('OffsetAccountName'),
  k('OffsetAccountNumber'),
  k('OffsetAccountType'),
  k('OffsetAccountId'),
  k('PartyName'),
  k('PartyId'),
  k('TxnTypeName'),
  k('TransactionTypeCode'),     // hidden by default; canonical spot after TxnTypeName
  k('TransactionDetails'),
  k('AdditionalInformation'),
  k('Description1'),
  k('TransactionStatusIndicator'), // hidden by default
  k('Hash'),                    // hidden by default
  k('EntryId'),
  k('ClientCode'),
  k('ErpCode'),
  k('IsStale'),                 // hidden by default
  k('StaleSinceUtc'),           // hidden by default
  k('Comment'),
];

const LEDGER_SPEC: DataSetColumnSpec = {
  defaultOrder: LEDGER_ORDER,
  defaultVisible: new Set([
    k('StatementId'),
    k('StatementDate'),
    k('AccountName'),
    k('AccountNumber'),
    k('AccountType'),
    k('AccountId'),
    k('BankName'),
    '__debit',
    '__credit',
    k('CurrencyCode'),
    k('AmountFcy'),
    k('RunningBalance'),
    k('OffsetAccountName'),
    k('OffsetAccountNumber'),
    k('OffsetAccountType'),
    k('OffsetAccountId'),
    k('PartyName'),
    k('PartyId'),
    k('TxnTypeName'),
    k('TransactionDetails'),
    k('AdditionalInformation'),
    k('Description1'),
    k('EntryId'),
    k('ClientCode'),
    k('ErpCode'),
    k('Comment'),
  ]),
  neverShow: new Set([
    k('BankSwiftCode'),
    k('FundsCode'),
    k('BankReference'),
    k('Description2'),
    k('Hints'),
  ]),
};

const SPECS: Record<string, DataSetColumnSpec> = {
  MT940: MT940_SPEC,
  MT942: MT942_SPEC,
  INTERIM_MT940: INTERIM_MT940_SPEC,
  Ledger: LEDGER_SPEC,
};

/** Resolve the column spec for a DataSetType; unknown/absent types get the
 *  MT940 spec (the browse/"View all" default, matching DEFAULT_DATA_SET_TYPE). */
export function getColumnSpec(dataSetType: string | undefined | null): DataSetColumnSpec {
  return SPECS[dataSetType ?? ''] ?? MT940_SPEC;
}
