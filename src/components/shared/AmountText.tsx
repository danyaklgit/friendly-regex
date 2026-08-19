/**
 * Ledger numeric amount fields rendered like the Debit/Credit money cells:
 * thousands separators + a superscript 2-decimal fraction. Amounts only —
 * FXRate keeps its raw precision and NumLines is a count. No currency glyph:
 * unlike Debit/Credit (always the local currency), these carry the document
 * currency, which the CurrencyCode / TransactionCurrencyCode columns name.
 */
export const LEDGER_AMOUNT_FIELDS: ReadonlySet<string> = new Set([
  'AmountFcy',
  'TxnAmountFC',
  'TxnAmountLC',
  'VATAmount',
  'VATBaseAmount',
  'FXGainLoss',
]);

export function AmountText({ value }: { value: string | number }) {
  const num = typeof value === 'number' ? value : Number(value);
  // Non-numeric or blank payloads render verbatim rather than as NaN.
  if (!Number.isFinite(num) || (typeof value === 'string' && value.trim() === '')) {
    return <>{String(value)}</>;
  }
  const [integer, decimal] = Math.abs(num).toFixed(2).split('.');
  return (
    <span className="whitespace-nowrap tabular-nums">
      {num < 0 && <span>&#x2212;&nbsp;</span>}
      {Number(integer).toLocaleString()}
      <sup className="text-[0.65em] relative -top-[0.55em]">.{decimal}</sup>
    </span>
  );
}
