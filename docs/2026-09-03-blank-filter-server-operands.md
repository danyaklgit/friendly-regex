# Change note: "Is Blank or Empty" now filters SERVER-SIDE (backend-team commit)

**Who/why:** backend team, 2026-09-03, with Teddy's approval - a one-time commit to
this repo because operators needed to filter by blank Additional Information and
the UI team was offline. Please review like any PR; questions to the backend team.

## The problem

Selecting "Is Blank or Empty" sent NOTHING to the server. `buildInnerCondition`
deliberately dropped the condition (a Mongo regex can never match a null/missing
field, so it could not ride inside the REGEX structure) and the client post-filter
narrowed only the LOADED rows - so paging and counts ran on the unfiltered set,
and "show me the 35,204 blank-AdditionalInformation rows of NCBKSAJE/DR" was
impossible.

## The backend half (already merged in TxTEP)

`FilteringProperties` accepts two new top-level operands, handled in the funnel
every filtered read shares (grid, count, distincts, export):

```json
{ "ColumnName": "AdditionalInformation", "Value": "", "Operand": "ISBLANK" }
{ "ColumnName": "AdditionalInformation", "Value": "", "Operand": "ISNOTBLANK" }
```

Blank = null/missing, "", whitespace-only, or dash-only - exactly this app's own
"reads as `-`" convention (`evaluateRuleSet`'s `^[\s-]*$` plus the null arm), so
server results match what operators see as blank. `ISNOTBLANK` is the exact
negation. A `|` composite ColumnName means ANY field blank.

## What changed in this repo

1. **`src/utils/buildRulesetFilters.ts`**
   - New `extractSingleGroupBlankFilters(ruleGroups)`: when EXACTLY ONE rule group
     has filled conditions, its blank/non-blank conditions are lifted out as
     top-level `ISBLANK`/`ISNOTBLANK` FilterProperties. Top-level filters AND with
     everything else, which matches a single group's AND semantics - with 2+ OR
     groups the lift is not semantically possible, so those keep the legacy
     behavior (condition dropped from the payload, client post-filter narrows).
   - New `buildRuleFilterProperties(ruleGroups)`: lifted blank filters + the REGEX
     entry over the remaining conditions. **Use this wherever rule groups are
     turned into outgoing filters**; calling `buildRegexFilterFromRuleGroups`
     directly silently loses blank conditions again.
   - `buildRulesetFilters` routes through it.
2. **`src/components/transactions/TransactionsTab.tsx`**
   - The inline-builder scope filter now forwards the lifted blank operands next
     to the REGEX entry.
   - The "Matching Rules" chip uses `buildRuleFilterProperties` (was
     `buildRegexFilterFromRuleGroups`), so a chip that is ONLY a blank condition
     now sends a real filter; the active-filter count reflects it.
   - The client-side post-filter (`hasNullaryBlankCondition` in `filteredData`)
     is UNCHANGED on purpose: it still serves the multi-group case and sample
     mode, and in the single-group case it agrees with the server (harmless
     double filter).
3. **`src/utils/buildRulesetFilters.test.ts`** - the three drop-semantics tests
   became four lift-semantics tests (single-group lift for both operands, mixed
   group keeps non-blank siblings in REGEX, multi-group keeps legacy drop).

## Deploy order - IMPORTANT

The portal build carrying this change must deploy **after (or with) the TxTEP
backend build that adds the operands**. An older backend throws
`Operand ISBLANK not supported` (HTTP 500) for any blank filter. The backend
change is committed and pending Teddy's deploy; check with him before shipping
a portal build.

## Follow-ups you may want (not done here)

- Update your CLAUDE.md (gotcha about blank ops + section 14/15) per your own
  refresh convention - we deliberately did not edit your context file.
- Consider a first-class "blank only" affordance on narrative columns in the
  filter bar; the operand works there too.
- `lint` currently reports 15 pre-existing `no-explicit-any` errors elsewhere in
  the repo (none in the touched files); tests are green (1,546) and `npm run
  build` passes.
