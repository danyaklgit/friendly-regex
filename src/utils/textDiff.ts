/**
 * Simple common-prefix + common-suffix diff. Good enough for regex strings and
 * short attribute values where the user is typically tweaking a contiguous
 * window (swapping a prefix, changing a capture group, etc.).
 *
 * Returns the shared head, the differing middle of each side, and the shared
 * tail. If the strings are identical, both middles are empty. If there is no
 * shared prefix or suffix, the whole of each string is returned as the middle.
 */
export interface TextDiff {
  head: string;
  oldMiddle: string;
  newMiddle: string;
  tail: string;
}

export function diffStrings(oldStr: string, newStr: string): TextDiff {
  if (oldStr === newStr) {
    return { head: oldStr, oldMiddle: '', newMiddle: '', tail: '' };
  }

  const minLen = Math.min(oldStr.length, newStr.length);

  let prefix = 0;
  while (prefix < minLen && oldStr[prefix] === newStr[prefix]) prefix++;

  let suffix = 0;
  // Stop the suffix walk before it overlaps the prefix window on either side.
  const maxSuffix = minLen - prefix;
  while (
    suffix < maxSuffix &&
    oldStr[oldStr.length - 1 - suffix] === newStr[newStr.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    head: oldStr.slice(0, prefix),
    oldMiddle: oldStr.slice(prefix, oldStr.length - suffix),
    newMiddle: newStr.slice(prefix, newStr.length - suffix),
    tail: oldStr.slice(oldStr.length - suffix),
  };
}
