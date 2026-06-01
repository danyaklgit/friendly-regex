import type { BackendAttribute } from '../../types/lov';

/**
 * Generic LOV resolution for user-mode attribute display.
 *
 * Many transaction attributes carry a coded value (a bank SWIFT code, a SADAD
 * biller code, a country code, …) whose human name lives in a LOV. The
 * attribute catalog (`activeAttributes`, from GetAttributes) tells us which LOV
 * an attribute draws from via `PossibleLOVTag`. We project that into a
 * name→LOVTag map and resolve values against `lovLookup` (LOVTag → code→name),
 * exactly as the operator table does.
 *
 * A small heuristic fallback covers the demo-critical cases (beneficiary bank,
 * biller) even when the catalog has no `PossibleLOVTag` for them, so those
 * never show a raw code.
 */

export type LovLookup = Map<string, Map<string, string>>;
export type AttrLovTagMap = Map<string, string>;

/** Heuristic LOV tags for attribute names the catalog may not annotate. */
const HEURISTIC_RULES: { test: RegExp; lovTag: string }[] = [
  { test: /biller/i, lovTag: 'SADAD_BILLERS' },
  { test: /bank/i, lovTag: 'BANKS' },
  { test: /country|countries|nationality/i, lovTag: 'COUNTRIES' },
];

/**
 * Build a lowercased attribute-name → LOVTag map from the attribute catalog.
 * Later use {@link resolveLovValue} to turn a coded value into its name.
 */
export function buildAttrLovTagMap(attributes: BackendAttribute[]): AttrLovTagMap {
  const map = new Map<string, string>();
  for (const attr of attributes) {
    if (attr.PossibleLOVTag && attr.Value) {
      const key = attr.Value.trim().toLowerCase();
      if (!map.has(key)) map.set(key, attr.PossibleLOVTag);
    }
  }
  return map;
}

/** Normalize a LOV tag the way `lovLookup` indexes them (raw + squashed). */
function lookupLov(lovLookup: LovLookup, lovTag: string): Map<string, string> | undefined {
  return lovLookup.get(lovTag) ?? lovLookup.get(lovTag.replace(/[_ ]/g, '').toLowerCase());
}

/** Resolve the LOVTag for an attribute name: catalog first, then heuristic. */
function lovTagForAttr(name: string, map: AttrLovTagMap): string | undefined {
  const direct = map.get(name.trim().toLowerCase());
  if (direct) return direct;
  for (const rule of HEURISTIC_RULES) {
    if (rule.test.test(name)) return rule.lovTag;
  }
  return undefined;
}

/**
 * Resolve a single attribute value to its friendly LOV name, or return the raw
 * value unchanged when the attribute isn't LOV-backed or the code isn't found.
 */
export function resolveLovValue(
  name: string,
  value: string,
  lovLookup: LovLookup,
  map: AttrLovTagMap,
): string {
  if (!value) return value;
  const lovTag = lovTagForAttr(name, map);
  if (!lovTag) return value;
  const lovMap = lookupLov(lovLookup, lovTag);
  if (!lovMap) return value;
  return lovMap.get(value.trim()) ?? value;
}
