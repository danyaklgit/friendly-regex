import type { ClientSyncKbMatch, ClientSyncMatchParty } from '../../api/clientSync';

/**
 * Pure helpers for the grouped "What BwaTech holds now" view
 * (UI_ClientSync_HoldsNowGrouped section 1.2). Party levels are compared
 * case-insensitively; anything outside the four known levels is "a new level"
 * and is never indented.
 */

export function levelKey(level: string): string {
  return level.trim().toUpperCase();
}

/** The party the collapsed header names: the displayed one, else outlet, head office, franchise, unrecorded, else the first. */
const SUMMARY_ORDER = ['OUTLET', 'HO', 'FRANCHISE', 'UNRECORDED'];
export function summaryParty(match: ClientSyncKbMatch): ClientSyncMatchParty | null {
  const displayed = match.Parties.find((p) => p.IsDisplayed);
  if (displayed) return displayed;
  for (const level of SUMMARY_ORDER) {
    const party = match.Parties.find((p) => levelKey(p.Level) === level);
    if (party) return party;
  }
  return match.Parties[0] ?? null;
}

/** "Head office 2400556677 · Al Noor Grocery"; a missing code or name is simply left out. */
export function summaryPartyText(party: ClientSyncMatchParty): string {
  const head = party.Code ? `${party.Title} ${party.Code}` : party.Title;
  return party.NameEn ? `${head} · ${party.NameEn}` : head;
}

/**
 * Indent depth of each party, in the given top-down order: the head office
 * steps in under a franchise, the outlet under each of franchise and head
 * office present above it. Other levels and unrecorded customers stay flush.
 */
export function partyIndents(parties: readonly ClientSyncMatchParty[]): number[] {
  const seen = new Set<string>();
  return parties.map((party) => {
    const level = levelKey(party.Level);
    let depth = 0;
    if (level === 'HO') depth = seen.has('FRANCHISE') ? 1 : 0;
    else if (level === 'OUTLET') depth = (seen.has('FRANCHISE') ? 1 : 0) + (seen.has('HO') ? 1 : 0);
    seen.add(level);
    return depth;
  });
}

/** The party of `match` at `level`; with no level, the party flagged as displayed. */
export function findParty(match: ClientSyncKbMatch | undefined, level: string | null): ClientSyncMatchParty | null {
  if (!match) return null;
  if (level === null) return match.Parties.find((p) => p.IsDisplayed) ?? null;
  return match.Parties.find((p) => levelKey(p.Level) === levelKey(level)) ?? null;
}

/** Title of the party the displayed customer is, falling back to the raw level in title case. */
export function matchLevelTitle(matches: readonly ClientSyncKbMatch[], matchNumber: number, level: string | null): string | null {
  const party = findParty(matches.find((m) => m.Number === matchNumber), level);
  if (party) return party.Title;
  if (level === null) return null;
  const words = level.trim().toLowerCase().split(/[\s_]+/).filter(Boolean);
  return words.length > 0 ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : null;
}

/** True when any key of the match carries no layout label (a key the layout does not know yet). */
export function matchHasUnknownKey(match: ClientSyncKbMatch): boolean {
  return match.Fields.some((f) => f.Label === null) || match.Parties.some((p) => p.Attributes.some((a) => a.Label === null));
}
