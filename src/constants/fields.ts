export const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'DRAFT'] as const;
export const CERTAINTY_OPTIONS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const SIDE_OPTIONS = ['CR', 'DR', 'RC', 'RD'] as const;
export const BANK_SWIFT_CODE_OPTIONS = [
  'ARNBSARI', 'BSFRSARI', 'GULFSARI', 'INMASARI',
  'NCBKSAJE', 'RIBLSARI', 'RJHISARI', 'SABBSARI',
] as const;
export const TXN_TYPE_OPTIONS = [
  '101', '103', '202', 'BRF', 'CHG', 'CHK', 'CLR', 'COL',
  'COM', 'DCR', 'DPF', 'DPR', 'FEX', 'INT', 'LDP', 'MSC',
  'OTP', 'PFT', 'RTI', 'STO', 'TPY', 'TRF', 'VAT',
] as const;
// Ledger (ERP) row fields offered as rule-condition / attribute Source
// Fields, in addition to the standard banking fields. The dropdowns are
// data-driven (fieldMeta.sourceFields ∩ allow-list), so these surface only
// when the loaded rows actually carry them — i.e. Ledger checkouts — and the
// MT940/intraday dropdowns are unchanged. Names follow the Ledger record
// model V2 (2026-08-19): dedicated Ledger fields, no reused statement names.
//
// Every TEXT-shaped Ledger column an operator can see is offered. Deliberate
// exclusions (cannot back a REGEX rule / never useful as an extraction
// source): numeric amounts (AmountFcy, FXRate, TxnAmountFC/LC, VATAmount,
// VATBaseAmount, FXGainLoss, NumLines), booleans (IsReversal/IsReversed,
// TransactionIsReversal/IsReversed, Account/OffsetAccountIsBankAccount),
// dates (PostingDate/ValueDate/EntryDate — conditions dropped dates in
// `45b1970`; the attribute editor allows dates via its own list), and the
// client-side stale pair (IsStale, StaleSinceUtc). Fields statement rows
// ALSO carry (Side, Sequence, TransactionTypeCode, CurrencyCode, Comment,
// Hash) must never be listed here — they would leak into the statement
// dropdowns; Side is special-cased for Ledger in ConditionEditor.
export const LEDGER_SOURCE_FIELDS = [
  // Identity / grouping
  'TransactionId', 'EntryId', 'ClientCode', 'ErpCode', 'TxnTypeName',
  // Account (AccountCode was dropped by the V2.1 remap — permanently NULL,
  // it duplicated AccountNumber)
  'AccountId', 'AccountName', 'AccountNumber', 'AccountType',
  'AccountBankCode', 'AccountIBAN', 'AccountCurrency',
  // Offset account
  'OffsetAccountCode', 'OffsetAccountId', 'OffsetAccountName',
  'OffsetAccountNumber', 'OffsetAccountType', 'OffsetAccountBankCode',
  'OffsetAccountIBAN', 'OffsetAccountCurrency',
  // Counterparty
  'CounterPartyType', 'CounterPartyCode', 'CounterPartyName',
  'CounterPartyBankCode', 'CounterPartyAccountNumber', 'CounterPartyCountryCode',
  // Narratives / references
  'Narrative', 'TransactionRef', 'SourceRef', 'Notes',
  'DocumentRef', 'ExternalRef', 'ReversalOfRef', 'GroupingRef', 'BusinessUnit',
  'PaymentMethod', 'PaymentRef', 'ExtPaymentRef', 'VATCode',
  // Document level
  'Entity', 'FiscalPeriod', 'Source', 'TransactionNarrative', 'TransactionNotes',
  'TransactionExternalRef', 'TransactionReversalOfRef', 'TransactionCurrencyCode',
  'ReasonCode', 'ReasonDescription',
] as const;

export const VALIDATION_RULE_TAG_OPTIONS = ['STRING', 'NUMBER', 'DATE'] as const;
export const DATA_TYPE_OPTIONS = VALIDATION_RULE_TAG_OPTIONS;

// Source fields the backend stores as ISO date-times. Used both by the
// condition editor (to restrict the operation set and surface a date picker)
// and by buildRulesetFilters (to route GT/LT through the date-range regex
// compiler).
export const DATE_SOURCE_FIELDS = new Set(['StatementDate', 'PostingDate', 'EntryDate', 'ValueDate']);
