/**
 * Converts PascalCase/camelCase field names to human-readable labels.
 * Examples:
 *   BankSwiftCode → Bank Swift Code
 *   Description1  → Description 1
 *   IBAN          → IBAN
 *   ValueDate     → Value Date
 *   FundsCode     → Funds Code
 *   TransactionTypeCode → Transaction Type Code
 */
export function humanizeFieldName(name: string): string {
  return name
    // Insert space before uppercase letters that follow lowercase letters: "bankSwift" → "bank Swift"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase letter followed by lowercase, when preceded by uppercase: "IBANCode" → "IBAN Code"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Insert space between letters and digits: "Description1" → "Description 1"
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    // Insert space between digits and letters: "2nd" → "2 nd" (edge case, but safe)
    .replace(/(\d)([a-zA-Z])/g, '$1 $2');
}
