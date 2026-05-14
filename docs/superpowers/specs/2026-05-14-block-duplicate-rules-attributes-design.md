# Block creation/saving when the rule builder contains duplicates

**Date:** 2026-05-14
**Surface:** Inline rule builder in `TransactionsTab`, the `TagWizardModal` it
opens, and the per-row editors (`ConditionEditor`, `AttributeEditor`,
`RuleGroupEditor`, `StepAttributes`).
**Status:** Approved (pending written-spec review).

## 1. Problem

The rule builder currently allows the user to save tag definitions that contain
duplicates:

- Two rule sets (AND-groups) with identical conditions.
- Two conditions inside the same rule set with identical
  source field + operation + value (+ values/prefix/suffix).
- Two attributes with the same `AttributeTag` name.

Today the first two cases are *visually* flagged
(`computeDuplicateGroupIndexes`, within-group `isSameCondition` check) and the
duplicate condition's inline Save button is disabled, but nothing stops the user
from pressing the top-level **Create Rule with current settings** in the inline
builder or **Create Rule / Save Changes** in the wizard. Attributes have no
duplicate detection at all in the rule-builder flow.

The result: duplicate rules / attributes can be persisted, producing tag
definitions whose semantics are at best redundant and at worst contradictory
(e.g. two attributes with the same `Key` collide when the backend returns
`OpsAttributes`).

## 2. Goal

When the rule builder contains any of the duplicates above:

1. Surface a clear, persistent message on each offending row identifying what
   the duplicate is and how to resolve it (rename, remove, or change the
   conflicting field).
2. Disable the row's own Save / collapse-confirm button so the duplicate cannot
   be committed locally.
3. Disable the top-level **Create Rule with current settings** button (inline
   builder) and the **Create Rule / Save Changes** button (wizard modal) until
   every duplicate is resolved or removed.
4. Disable forward navigation in the wizard modal on the Rule Expressions and
   Attributes steps when the corresponding section is in a duplicate state, so
   the user can't traverse past a broken section.

The user must explicitly fix or discard the duplicate; no auto-merge.

## 3. Non-goals

- Detecting duplicates across **different tag definitions**. The user said
  "duplicate rules or attributes" inside one tag's builder; cross-tag
  conflicts are already partially surfaced by the "Tags Matching The Specified
  Rule Sets" panel and are out of scope here.
- Changing the global Attribute Form modal (`AttributeFormModal`). It already
  blocks duplicates against the global attribute registry; that logic is
  untouched.
- Auto-merging duplicate rules / attributes. The user fixes manually.

## 4. What counts as a duplicate

| Surface           | Duplicate definition                                                                                                                            | First-occurrence flagging                                  |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| Whole rule sets   | Two AND-groups share the same `groupFingerprint` (order-independent set of filled-condition fingerprints). Already implemented in `ruleFingerprint.ts`. | Both members of a duplicate pair are flagged (existing behavior). |
| Conditions within a rule set | Two filled conditions inside the same group share the same `conditionFingerprint`. Already implemented. | Only the *later* duplicate is flagged; the first occurrence stays clean. |
| Attributes        | Two attributes share the same trimmed, non-empty `attributeTag`.                                                                                | Only the *later* duplicate is flagged.                       |

Empty placeholder rows (no `value` for a condition, no `attributeTag` for an
attribute) never participate in duplicate comparisons. That keeps the "add a
new empty row" affordance from false-flagging.

## 5. Approach

Mirror the existing rule-set duplicate pattern for attributes and centralize
the gate on the top-level submit buttons.

### 5.1 New utility

Add `attributeFingerprint.ts` next to `ruleFingerprint.ts`:

```ts
export function isFilledAttribute(a: AttributeFormValue): boolean {
  return a.attributeTag.trim().length > 0;
}

export function attributeNameKey(a: AttributeFormValue): string {
  return a.attributeTag.trim().toLowerCase();
}

/** For each attribute, returns the index of the first earlier attribute with
 *  the same name, or null if it's unique (or empty). */
export function computeDuplicateAttributeIndexes(
  attributes: AttributeFormValue[]
): (number | null)[] {
  const seen = new Map<string, number>();
  return attributes.map((a, i) => {
    if (!isFilledAttribute(a)) return null;
    const key = attributeNameKey(a);
    const earlier = seen.get(key);
    if (earlier === undefined) {
      seen.set(key, i);
      return null;
    }
    return earlier;
  });
}
```

Note: matching is case-insensitive on the trimmed name so "BeneficiaryName" and
"beneficiaryname" collide. The first occurrence wins; later ones are flagged.

### 5.2 New combined-state helpers

In `ruleFingerprint.ts` (or a co-located validation helper), expose:

```ts
export function hasDuplicateGroups(ruleGroups: AndGroupFormValue[]): boolean {
  return computeDuplicateGroupIndexes(ruleGroups).some((i) => i !== null);
}

export function hasWithinGroupConditionDuplicates(
  ruleGroups: AndGroupFormValue[]
): boolean {
  for (const g of ruleGroups) {
    const seen = new Set<string>();
    for (const c of g.conditions) {
      if (!isFilledCondition(c)) continue;
      const fp = conditionFingerprint(c);
      if (seen.has(fp)) return true;
      seen.add(fp);
    }
  }
  return false;
}
```

`hasDuplicateAttributeNames` is the `.some(...)` counterpart of
`computeDuplicateAttributeIndexes` from §5.1.

### 5.3 UI changes

#### `AttributeEditor`

- Two new optional props mirroring `ConditionEditor`:
  - `isDuplicateName?: boolean` — true when this row is a later duplicate.
  - `duplicateOfIndex?: number | null` — for the inline message ("duplicate of
    Attribute #N"). Optional.
- When `isDuplicateName`, render the same red-banner style used in
  `RuleGroupEditor` for `duplicateOfGroupIndex`:
  > "An attribute named **{trimmed name}** already exists in this tag. Rename
  > or remove it to continue."
- Disable the row's inline "Save" button (the one that collapses an editing
  attribute) with a tooltip explaining the gate.

#### `StepAttributes`

- Compute `duplicateOfIndex = computeDuplicateAttributeIndexes(attributes)`
  via `useMemo`.
- Pass `isDuplicateName={duplicateOfIndex[i] !== null}` and
  `duplicateOfIndex={duplicateOfIndex[i]}` to each `AttributeEditor`.

#### `TransactionsTab` — inline builder gate

`canSubmitBuilder` becomes:

```ts
const canSubmitBuilder =
  builderHasTransactionType
  && !hasDuplicateGroups(builder.formState.ruleGroups)
  && !hasWithinGroupConditionDuplicates(builder.formState.ruleGroups)
  && !hasDuplicateAttributeNames(builder.formState.attributes);
```

When disabled, the button keeps its existing visual treatment; the `title`
attribute adds "Fix or remove the duplicates flagged above" so hover gives the
reason. (The persistent red banners on the offending rows already make the
*what* obvious; the tooltip only adds *why the button is off*.)

#### `TagWizardModal` — modal gate

Same expression gates the final-step button at
[TagWizardModal.tsx:88](src/components/wizard/TagWizardModal.tsx#L88). Also
extend the per-step `canProceed()`:

- On the Rule Expressions step: refuse Next when there's a within-group OR
  cross-group rule duplicate.
- On the Attributes step: refuse Next when there's an attribute-name
  duplicate.

That keeps the user from stepping past a duplicate, even if they ignore the
final-step gate.

### 5.4 Unaffected code

- `ConditionEditor`, `RuleGroupEditor`, `StepRuleExpressions` already handle
  rule duplicates; no behavioural change there beyond the central helpers
  being reused by the new gates.
- `AttributeFormModal` (global attribute creator) is untouched.

## 6. Testing strategy

Add a Vitest suite for `attributeFingerprint.ts` covering:

- Empty list → all-null.
- All unique names → all-null.
- Trimming + case-insensitive collision.
- Empty `attributeTag` rows excluded (returns null for them).
- Multiple duplicates of the same name → all later occurrences point to the
  first occurrence's index.

For `hasWithinGroupConditionDuplicates`: tests for empty groups, single
condition, two filled identical conditions in one group → true, two identical
conditions across different groups → false (cross-group dupes are covered by
`computeDuplicateGroupIndexes`, not this helper).

No new UI snapshot tests beyond what's already covered for `ConditionEditor`
banners.

## 7. Risks and trade-offs

- **False positive on case-insensitive match**: in theory the backend could
  treat `BeneficiaryName` and `beneficiaryname` as distinct keys. In practice
  the existing global-attribute registry and the
  `OpsAttributes[*].Key` shape are case-sensitive strings, so two attributes
  differing only in case would still collide on the response object's keys in
  any reasonable consumer. Picking case-insensitive matching errs on the safe
  side and matches user intent.
- **The wizard's per-step gate** is an additional touch point; if the
  duplicate detection helpers are wrong the user gets stuck. The Vitest
  coverage in §6 mitigates this. The helpers return false for empty input, so
  a freshly opened wizard is never stuck behind the gate.

## 8. Acceptance criteria

1. Adding two `BeneficiaryName` attributes shows a red banner on the second
   one, disables its inline Save, and disables "Create Rule with current
   settings" / "Create Rule" / "Save Changes" until one is renamed or removed.
2. Adding two identical conditions inside one rule set already shows the
   banner today; the new build also disables the top-level submit.
3. Adding two identical rule sets already shows the banners today; the new
   build also disables the top-level submit.
4. Removing or fixing all duplicates re-enables every gate.
5. The wizard's "Next" button is disabled on the Rule Expressions step while
   any rule-set or within-group duplicate exists, and on the Attributes step
   while any attribute-name duplicate exists.
