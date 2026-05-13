/**
 * Turns an LOV tag identifier into an operator-friendly label.
 *
 * Examples:
 *   BANKS                      -> "Banks"
 *   SADAD_BILLERS              -> "Sadad Billers"
 *   SADAD_GOVERNMENT_SERVICES  -> "Sadad Government Services"
 *
 * Unknown tags are split on common separators (`_`, `-`, space) and title-cased
 * so a new LOV tag added on the backend renders sensibly without a code change.
 */
export function humanizeLovTag(tag: string): string {
  if (!tag) return '';
  return tag
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
