/**
 * Token-level rewrites applied after camelCase splitting, per the
 * Transactions column spec (docs/Transactions-Column-Spec.md):
 *  - abbreviations expand ("Txn" → "Transaction")
 *  - acronym tokens keep their casing ("Erp" → "ERP", "Fcy" → "FCY",
 *    "Utc" → "UTC"; "IBAN" needs no entry — it never splits)
 * Applied wherever a field name surfaces (headers, column picker, tooltips,
 * context modal), so any future field gets the treatment automatically.
 */
const TOKEN_REWRITES: Record<string, string> = {
  Txn: 'Transaction',
  Erp: 'ERP',
  Fcy: 'FCY',
  Utc: 'UTC',
};

/**
 * Converts PascalCase/camelCase field names to human-readable labels.
 * Examples:
 *   BankSwiftCode → Bank Swift Code
 *   Description1  → Description 1
 *   IBAN          → IBAN
 *   ValueDate     → Value Date
 *   FundsCode     → Funds Code
 *   TransactionTypeCode → Transaction Type Code
 *   TxnTypeName   → Transaction Type Name
 *   ErpCode       → ERP Code
 *   AmountFcy     → Amount FCY
 *   StaleSinceUtc → Stale Since UTC
 */
export function humanizeFieldName(name: string): string {
  return name
    // Replace underscores with spaces: "Additional_Information" → "Additional Information"
    .replace(/_/g, ' ')
    // Insert space before uppercase letters that follow lowercase letters: "bankSwift" → "bank Swift"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase letter followed by lowercase, when preceded by uppercase: "IBANCode" → "IBAN Code"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Insert space between letters and digits: "Description1" → "Description 1"
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    // Insert space between digits and letters: "2nd" → "2 nd" (edge case, but safe)
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    // Token rewrites (abbreviation expansion + acronym casing)
    .split(' ')
    .map((token) => TOKEN_REWRITES[token] ?? token)
    .join(' ');
}
