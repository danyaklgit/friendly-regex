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
  k('Side'),                    // hidden by default (identity carries the side)
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

// Ledger (ERP) — record model V2 (backend deploy 2026-08-19). Ledger rows
// carry DEDICATED fields instead of reusing statement fields:
//   StatementId → TransactionId (journal-entry grouping key)
//   StatementDate → PostingDate, IBAN → AccountIBAN,
//   AdditionalInformation → TransactionRef, TransactionDetails → Narrative,
//   Description1 → SourceRef, PartyId → CounterPartyCode,
//   PartyName → CounterPartyName, BankName → AccountBankCode.
// RunningBalance is no longer populated (per-day balances live in the ledger
// headers) → neverShow, alongside every old statement-field name (the gateway
// still serves StatementId/PartyId/PartyName/BankName as deprecated get-only
// aliases; neverShow keeps those alias duplicates out of the picker).
//
// Conservative defaults: the pre-V2 visible set carried over under the new
// names; new V2 line-level fields sit hidden at canonical spots; new
// document-level fields (same value on every line of one accounting document)
// sit hidden at the tail. Grouped identity → account → amounts → offset →
// counterparty → payment → type → narrative → refs/VAT/reversal → ERP identity
// → document tail.
const LEDGER_ORDER = [
  k('TransactionId'),
  k('PostingDate'),
  k('Sequence'),                // hidden by default (line number)
  k('ValueDate'),               // hidden by default
  k('EntryDate'),               // hidden by default
  k('AccountName'),
  k('AccountNumber'),
  k('AccountIBAN'),             // hidden by default
  k('AccountType'),
  k('AccountId'),
  k('AccountBankCode'),
  k('AccountCurrency'),         // hidden by default
  k('AccountIsBankAccount'),    // hidden by default
  k('Side'),                    // default-visible: a Ledger library spans CR and DR
  '__debit',
  '__credit',
  k('CurrencyCode'),
  k('AmountFcy'),
  k('OffsetAccountName'),
  k('OffsetAccountNumber'),
  k('OffsetAccountCode'),       // hidden by default
  k('OffsetAccountIBAN'),       // hidden by default
  k('OffsetAccountType'),
  k('OffsetAccountId'),
  k('OffsetAccountBankCode'),   // hidden by default
  k('OffsetAccountCurrency'),   // hidden by default
  k('OffsetAccountIsBankAccount'), // hidden by default
  k('CounterPartyName'),
  k('CounterPartyCode'),
  k('CounterPartyType'),        // hidden by default
  k('CounterPartyBankCode'),    // hidden by default
  k('CounterPartyAccountNumber'), // hidden by default
  k('CounterPartyCountryCode'), // hidden by default
  k('PaymentMethod'),           // hidden by default
  k('PaymentRef'),              // hidden by default
  k('ExtPaymentRef'),           // hidden by default
  k('TxnTypeName'),
  k('TransactionTypeCode'),     // hidden by default; canonical spot after TxnTypeName
  // V2.1 remap (2026-08-20): Zoho's ERP description lives in
  // TransactionNarrative and its reference_number in ExternalRef — those are
  // the visible text/reference columns. Narrative and TransactionRef are NULL
  // for Zoho since the remap but stay offerable-hidden (a future ERP may fill
  // them).
  k('TransactionNarrative'),
  k('Narrative'),               // hidden by default
  k('ExternalRef'),
  k('TransactionRef'),          // hidden by default
  k('SourceRef'),
  k('Notes'),                   // hidden by default
  k('GroupingRef'),             // hidden by default
  k('BusinessUnit'),            // hidden by default
  k('DocumentRef'),             // hidden by default
  k('VATCode'),                 // hidden by default
  k('VATAmount'),               // hidden by default
  k('VATBaseAmount'),           // hidden by default
  k('IsReversal'),              // hidden by default
  k('IsReversed'),              // hidden by default
  k('ReversalOfRef'),           // hidden by default
  k('FXGainLoss'),              // hidden by default
  k('Hash'),                    // hidden by default
  k('EntryId'),
  k('ClientCode'),
  k('ErpCode'),
  k('IsStale'),                 // hidden by default
  k('StaleSinceUtc'),           // hidden by default
  // Document-level V2 fields (repeated on every line of a document) — hidden.
  k('Entity'),
  k('FiscalPeriod'),
  k('TransactionNotes'),
  k('TransactionExternalRef'),
  k('TransactionCurrencyCode'),
  k('FXRate'),
  k('TxnAmountFC'),
  k('TxnAmountLC'),
  k('NumLines'),
  k('Source'),
  k('TransactionIsReversal'),
  k('TransactionIsReversed'),
  k('TransactionReversalOfRef'),
  k('ReasonCode'),
  k('ReasonDescription'),
  k('Comment'),
];

const LEDGER_VISIBLE = new Set([
  k('TransactionId'),
  k('PostingDate'),
  k('AccountName'),
  k('AccountNumber'),
  k('AccountType'),
  k('AccountId'),
  k('AccountBankCode'),
  k('Side'),
  '__debit',
  '__credit',
  k('CurrencyCode'),
  k('AmountFcy'),
  k('OffsetAccountName'),
  k('OffsetAccountNumber'),
  k('OffsetAccountType'),
  k('OffsetAccountId'),
  k('CounterPartyName'),
  k('CounterPartyCode'),
  k('TxnTypeName'),
  k('TransactionNarrative'),
  k('ExternalRef'),
  k('SourceRef'),
  k('EntryId'),
  k('ClientCode'),
  k('ErpCode'),
  k('Comment'),
]);

/** Fields only ever populated on Ledger rows — never offered elsewhere.
 *  Derived: every data column in the Ledger order that MT940 doesn't share. */
const MT940_ORDER_SET = new Set(MT940_ORDER);
const LEDGER_ONLY_KEYS = LEDGER_ORDER.filter(
  (key) => key.startsWith('data:') && !MT940_ORDER_SET.has(key),
);

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

const LEDGER_SPEC: DataSetColumnSpec = {
  defaultOrder: LEDGER_ORDER,
  defaultVisible: LEDGER_VISIBLE,
  neverShow: new Set([
    // Never populated on Ledger.
    k('BankSwiftCode'),
    k('FundsCode'),
    k('BankReference'),
    k('Description2'),
    k('Hints'),
    // Null on Ledger since model V2 (dedicated fields replaced them). The
    // gateway still serves some as deprecated aliases — keep them out of the
    // picker so the alias duplicates never surface.
    k('StatementId'),
    k('StatementDate'),
    k('IBAN'),
    k('AdditionalInformation'),
    k('TransactionDetails'),
    k('Description1'),
    k('PartyId'),
    k('PartyName'),
    k('BankName'),
    k('RunningBalance'),
    k('TransactionStatusIndicator'),
    // V2.1 (2026-08-20): AccountCode is dropped — it duplicated AccountNumber
    // and is NULL from the backend now.
    k('AccountCode'),
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
