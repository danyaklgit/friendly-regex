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
// Ledger (ERP) row fields offered as rule-condition Source Fields, in
// addition to the standard banking fields. The rule builder's dropdown is
// data-driven (fieldMeta.sourceFields ∩ allow-list), so these surface only
// when the loaded rows actually carry them — i.e. Ledger checkouts — and the
// MT940/intraday dropdowns are unchanged.
export const LEDGER_SOURCE_FIELDS = [
  'AccountId', 'AccountName', 'AccountNumber', 'AccountType',
  'OffsetAccountId', 'OffsetAccountName', 'OffsetAccountNumber', 'OffsetAccountType',
  'BankName', 'PartyId', 'PartyName',
] as const;

export const VALIDATION_RULE_TAG_OPTIONS = ['STRING', 'NUMBER', 'DATE'] as const;
export const DATA_TYPE_OPTIONS = VALIDATION_RULE_TAG_OPTIONS;

// Source fields the backend stores as ISO date-times. Used both by the
// condition editor (to restrict the operation set and surface a date picker)
// and by buildRulesetFilters (to route GT/LT through the date-range regex
// compiler).
export const DATE_SOURCE_FIELDS = new Set(['StatementDate', 'EntryDate', 'ValueDate']);
