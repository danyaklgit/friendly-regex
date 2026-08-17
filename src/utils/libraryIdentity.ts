import type { ContextEntry, TagSpecLibrary } from '../types';
import type { FilterProperty } from '../api/transactions';
import { getContextValue } from '../types/tagSpec';

/**
 * Library / checkout identity, centralized.
 *
 * Every DataSetType identifies its TagSpec library by the context pair
 * (BankSwiftCode, Side) — EXCEPT Ledger, whose library is identified by
 * (ClientCode, ErpCode). Ledger rows carry `BankSwiftCode = null`; one Ledger
 * library covers both CR and DR rows, so there is no side in its identity.
 *
 * The decision "is this bank/side or client/erp?" is keyed off DataSetType and
 * lives ONLY here, so the ~12 coupling sites (storage keys, identity matching,
 * scope filters, display strings) branch through these helpers instead of
 * scattering `if (dataSetType === 'Ledger')` across the app.
 *
 * `getContextValue` and `contextsMatch` (TagSpecContext) are already
 * key-agnostic, so client-side rule preview needs no change once the context
 * carries ClientCode / ErpCode.
 */

export const LEDGER_DATA_SET_TYPE = 'Ledger';

export function isLedger(dataSetType: string | undefined | null): boolean {
  return dataSetType === LEDGER_DATA_SET_TYPE;
}

/** Loose identity carrier — a CheckoutState, a form state, or an ad-hoc object. */
export interface IdentityInput {
  dataSetType?: string;
  bank?: string;
  side?: string;
  clientCode?: string;
  erpCode?: string;
}

/** The two Context keys that identify a library of this DataSetType. */
export function identityKeys(dataSetType: string | undefined): [string, string] {
  return isLedger(dataSetType) ? ['ClientCode', 'ErpCode'] : ['BankSwiftCode', 'Side'];
}

/**
 * The identity Context for a checkout, for `contextsMatch` comparisons against
 * a library's `Context`. Order-insensitive downstream, so key order here is
 * irrelevant.
 */
export function identityContext(x: IdentityInput): ContextEntry[] {
  if (isLedger(x.dataSetType)) {
    return [
      { Key: 'ClientCode', Value: x.clientCode ?? '' },
      { Key: 'ErpCode', Value: x.erpCode ?? '' },
    ];
  }
  return [
    { Key: 'BankSwiftCode', Value: x.bank ?? '' },
    { Key: 'Side', Value: x.side ?? '' },
  ];
}

/**
 * localStorage key suffix for drafts/baselines. THE single builder for the 3
 * key-construction sites (useLocalChanges, applyLocalDraftOrInvalidate,
 * TransactionsTab). Ledger keys off client/erp so an MT942 GULFSARI/DR draft
 * and a Ledger BWATECH/ZOHO draft can never collide.
 */
export function identityKeySuffix(x: IdentityInput): string {
  if (isLedger(x.dataSetType)) {
    return `${LEDGER_DATA_SET_TYPE}:${x.clientCode ?? ''}:${x.erpCode ?? ''}`;
  }
  return `${x.dataSetType ?? ''}:${x.bank ?? ''}:${x.side ?? ''}`;
}

/** True once the identity is fully specified (both parts present). */
export function hasCompleteIdentity(x: IdentityInput): boolean {
  return isLedger(x.dataSetType)
    ? !!x.clientCode && !!x.erpCode
    : !!x.bank && !!x.side;
}

/**
 * Grid / tags / preview scope filters for a checkout's identity. Ledger emits
 * ClientCode + ErpCode; every other type emits BankSwiftCode + Side. The
 * operand is the caller's (EQ for GetAllTransactionTags / GetMT940Transactions
 * base scope, IN for the ruleset preview) — both parts single-valued, so EQ/IN
 * are equivalent for Ledger.
 */
export function identityScopeFilters(x: IdentityInput, operand: 'EQ' | 'IN'): FilterProperty[] {
  if (isLedger(x.dataSetType)) {
    return [
      { ColumnName: 'ClientCode', Value: x.clientCode ?? '', Operand: operand },
      { ColumnName: 'ErpCode', Value: x.erpCode ?? '', Operand: operand },
    ];
  }
  return [
    { ColumnName: 'BankSwiftCode', Value: x.bank ?? '', Operand: operand },
    { ColumnName: 'Side', Value: x.side ?? '', Operand: operand },
  ];
}

/** Display labels + values for the checkout pill, backlog columns, dialogs. */
export interface ContextSummary {
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
}

export function libraryContextSummary(x: IdentityInput): ContextSummary {
  if (isLedger(x.dataSetType)) {
    return {
      primaryLabel: 'Client',
      primaryValue: x.clientCode ?? '',
      secondaryLabel: 'ERP',
      secondaryValue: x.erpCode ?? '',
    };
  }
  return {
    primaryLabel: 'Bank',
    primaryValue: x.bank ?? '',
    secondaryLabel: 'Side',
    secondaryValue: x.side ?? '',
  };
}

/**
 * Pull both identity pairs out of a library's Context. Missing keys come back
 * as ''. Callers read the pair that matches the library's DataSetType.
 */
export function identityFromContext(lib: TagSpecLibrary): {
  bank: string;
  side: string;
  clientCode: string;
  erpCode: string;
} {
  return {
    bank: getContextValue(lib.Context, 'BankSwiftCode') ?? '',
    side: getContextValue(lib.Context, 'Side') ?? '',
    clientCode: getContextValue(lib.Context, 'ClientCode') ?? '',
    erpCode: getContextValue(lib.Context, 'ErpCode') ?? '',
  };
}

/**
 * Does this library belong to the given checkout identity? The single matcher
 * for every "find the checked-out library" site.
 *
 * For Ledger the identity is (ClientCode, ErpCode). When the checkout carries
 * them we match exactly; when it does not (e.g. a handler that only received
 * ('','','Ledger')) the DataSetType alone identifies it, since there is one
 * Ledger library per client/erp. Bank/side are NOT compared for Ledger because
 * a Ledger library's Context has no BankSwiftCode/Side keys (getContextValue
 * would be `undefined`, never the '' a bank/side checkout would pass).
 */
export function libraryMatchesCheckout(lib: TagSpecLibrary, x: IdentityInput): boolean {
  if (lib.DataSetType !== x.dataSetType) return false;
  if (isLedger(x.dataSetType)) {
    if (x.clientCode && x.erpCode) {
      return (
        getContextValue(lib.Context, 'ClientCode') === x.clientCode &&
        getContextValue(lib.Context, 'ErpCode') === x.erpCode
      );
    }
    return true;
  }
  return (
    getContextValue(lib.Context, 'BankSwiftCode') === x.bank &&
    getContextValue(lib.Context, 'Side') === x.side
  );
}

/** Build a CheckoutState-shaped identity fragment from a library. */
export function checkoutIdentityFromLib(lib: TagSpecLibrary): {
  bank: string;
  side: string;
  clientCode: string;
  erpCode: string;
} {
  const id = identityFromContext(lib);
  if (isLedger(lib.DataSetType)) {
    return { bank: '', side: '', clientCode: id.clientCode, erpCode: id.erpCode };
  }
  return { bank: id.bank, side: id.side, clientCode: '', erpCode: '' };
}
