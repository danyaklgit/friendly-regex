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
export const VALIDATION_RULE_TAG_OPTIONS = ['STRING', 'NUMBER', 'DATE'] as const;
export const DATA_TYPE_OPTIONS = VALIDATION_RULE_TAG_OPTIONS;
