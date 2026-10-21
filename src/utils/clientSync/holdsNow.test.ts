import { describe, it, expect } from 'vitest';
import { summaryParty, summaryPartyText, partyIndents, findParty, matchLevelTitle, matchHasUnknownKey } from './holdsNow';
import { makeKbMatchFixture, makeMatchPartyFixture } from './fixtures';

const franchise = makeMatchPartyFixture({ Level: 'FRANCHISE', Title: 'Franchise', Code: '11223', NameEn: 'Al Noor International Company Grocery', IsDisplayed: false });
const ho = makeMatchPartyFixture({ Level: 'HO', Title: 'Head office', Code: '11223344556', NameEn: 'Al Noor International Company', IsDisplayed: false });
const outlet = makeMatchPartyFixture({ Level: 'outlet', Title: 'Outlet', Code: '9', NameEn: null, IsDisplayed: false });
const unrecorded = makeMatchPartyFixture({ Level: 'UNRECORDED', Title: 'Unrecorded customer', Code: null, NameEn: 'Someone', IsDisplayed: false });
const region = makeMatchPartyFixture({ Level: 'REGION', Title: 'Region', Code: 'R1', NameEn: 'West', IsDisplayed: false });

describe('summaryParty', () => {
  it('prefers the displayed party, then outlet, head office, franchise, unrecorded, then whatever is first', () => {
    expect(summaryParty(makeKbMatchFixture({ Parties: [franchise, { ...ho, IsDisplayed: true }, outlet] }))?.Level).toBe('HO');
    expect(summaryParty(makeKbMatchFixture({ Parties: [franchise, ho, outlet] }))?.Level).toBe('outlet');
    expect(summaryParty(makeKbMatchFixture({ Parties: [franchise, ho] }))?.Level).toBe('HO');
    expect(summaryParty(makeKbMatchFixture({ Parties: [franchise] }))?.Level).toBe('FRANCHISE');
    expect(summaryParty(makeKbMatchFixture({ Parties: [region, unrecorded] }))?.Level).toBe('UNRECORDED');
    expect(summaryParty(makeKbMatchFixture({ Parties: [region] }))?.Level).toBe('REGION');
    expect(summaryParty(makeKbMatchFixture({ Parties: [] }))).toBeNull();
  });
});

describe('summaryPartyText', () => {
  it('writes Title Code · NameEn and leaves out what is missing', () => {
    expect(summaryPartyText(ho)).toBe('Head office 11223344556 · Al Noor International Company');
    expect(summaryPartyText(outlet)).toBe('Outlet 9');
    expect(summaryPartyText(unrecorded)).toBe('Unrecorded customer · Someone');
  });
});

describe('partyIndents', () => {
  it('indents the head office under a franchise and the outlet under each of franchise and head office above it', () => {
    expect(partyIndents([franchise, ho, outlet])).toEqual([0, 1, 2]);
    expect(partyIndents([ho, outlet])).toEqual([0, 1]);
    expect(partyIndents([franchise, outlet])).toEqual([0, 1]);
    expect(partyIndents([outlet])).toEqual([0]);
  });

  it('never indents other levels or the unrecorded customer', () => {
    expect(partyIndents([franchise, ho, outlet, region, unrecorded])).toEqual([0, 1, 2, 0, 0]);
    expect(partyIndents([unrecorded])).toEqual([0]);
  });
});

describe('findParty and matchLevelTitle', () => {
  const matches = [
    makeKbMatchFixture({ Number: 0, Parties: [franchise, { ...ho, IsDisplayed: true }] }),
    makeKbMatchFixture({ Number: 2, Suffix: '_2', Parties: [outlet] }),
  ];

  it('finds a party by level ignoring case, or the displayed one when no level is given', () => {
    expect(findParty(matches[1], 'OUTLET')?.Code).toBe('9');
    expect(findParty(matches[0], null)?.Level).toBe('HO');
    expect(findParty(matches[1], null)).toBeNull();
    expect(findParty(undefined, 'HO')).toBeNull();
  });

  it("titles the displayed customer's match level from the party, else from the raw level", () => {
    expect(matchLevelTitle(matches, 0, 'ho')).toBe('Head office');
    expect(matchLevelTitle(matches, 0, null)).toBe('Head office');
    expect(matchLevelTitle(matches, 7, 'SUB_OUTLET')).toBe('Sub Outlet');
    expect(matchLevelTitle(matches, 7, null)).toBeNull();
  });
});

describe('matchHasUnknownKey', () => {
  it('is true when any field or party attribute has no label', () => {
    expect(matchHasUnknownKey(makeKbMatchFixture())).toBe(false);
    expect(matchHasUnknownKey(makeKbMatchFixture({ Fields: [{ Key: 'kb_new_signal', Value: 'x7', Label: null }] }))).toBe(true);
    expect(matchHasUnknownKey(makeKbMatchFixture({ Parties: [{ ...ho, Attributes: [{ Key: 'kb_ho_extra', Value: '1', Label: null }] }] }))).toBe(true);
  });
});
