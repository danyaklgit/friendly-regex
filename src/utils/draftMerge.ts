import type { TagSpecDefinition, TagSpecLibrary } from '../types';

/**
 * Merge a checked-out library's localStorage draft with the server's fresh
 * copy (UI_TagSpec_Draft_Cache_Server_Fields.md §4.2, 2026-09-09).
 *
 * The old overlay REPLACED the API's definition list with the cached one and
 * only invalidated on Id / VersionDate divergence — but every in-place server
 * write (a wizard save, another window's or user's save, a backend migration
 * like the Nickname backfill) bumps `LastUpdatedDate` / `SrvSavedRev`, never
 * `VersionDate`, so the browser displayed its own stale copy indefinitely.
 *
 * The draft is now a DIFF, not a replacement: the merge starts from the API
 * library (the server truth) and keeps only PENDING LOCAL EDITS — a
 * definition whose `current` version differs from its `baseline` version, a
 * definition added locally, a definition deleted locally. Everything else
 * (nicknames, server stamps, other windows' saves) flows through from the
 * API. Pending edits are rare by design (the wizard saves on every change),
 * so the merge almost always reduces to "take the API".
 *
 * Ownership rules honored here (§3): server stamps (`SrvAddedRev` /
 * `SrvSavedRev`) always come from whichever copy is kept verbatim — an
 * untouched definition carries the API's current stamps, a pending local
 * edit keeps the shape the wizard built (stamps stripped by
 * `toTagSpecDefinition`, marking it client-authored for the save merge).
 */

export interface DraftMergeResult {
  /** The API library with pending local edits applied — what state should hold. */
  merged: TagSpecLibrary;
  /** True when any pending local edit / add / delete survived — i.e. `merged`
   *  differs from the plain API library and the baseline must NOT equal it. */
  hasPendingEdits: boolean;
  /** Tags of pending local DELETES that were cancelled because the server's
   *  copy changed since the baseline (§4.2 step 3: never delete silently what
   *  the server edited meanwhile — the definition reappears instead). */
  resurrectedTags: string[];
}

function defsEqual(a: TagSpecDefinition, b: TagSpecDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when the server's copy moved past the baseline's snapshot of it —
 *  by stamp when both carry one (a migration always bumps `SrvSavedRev`),
 *  by content otherwise. */
function serverChangedSince(apiDef: TagSpecDefinition, baseDef: TagSpecDefinition): boolean {
  const apiRev = typeof apiDef.SrvSavedRev === 'number' ? apiDef.SrvSavedRev : null;
  const baseRev = typeof baseDef.SrvSavedRev === 'number' ? baseDef.SrvSavedRev : null;
  if (apiRev !== null && baseRev !== null) return apiRev > baseRev;
  return !defsEqual(apiDef, baseDef);
}

/**
 * @param apiLib   The library as `GetTagSpecLibraries` just returned it.
 * @param baseline The last known server snapshot (`tep:baseline`). Null =
 *                 no anchor — local differences cannot be told apart from
 *                 server changes, so the API wins entirely.
 * @param current  The working draft (`tep:current`). Null = no draft.
 *
 * The caller is responsible for identity: both cached libraries must belong
 * to the same document as `apiLib` (same `Id`) — a draft from an older
 * checkout must be dropped before merging.
 */
export function mergeDraftWithServer(
  apiLib: TagSpecLibrary,
  baseline: TagSpecLibrary | null,
  current: TagSpecLibrary | null,
): DraftMergeResult {
  if (!current || !baseline) {
    return { merged: apiLib, hasPendingEdits: false, resurrectedTags: [] };
  }

  const baseById = new Map(baseline.TagSpecDefinitions.map((d) => [d.Id, d]));
  const currById = new Map(current.TagSpecDefinitions.map((d) => [d.Id, d]));
  const apiIds = new Set(apiLib.TagSpecDefinitions.map((d) => d.Id));

  const mergedDefs: TagSpecDefinition[] = [];
  const resurrectedTags: string[] = [];
  let hasPendingEdits = false;

  for (const apiDef of apiLib.TagSpecDefinitions) {
    const baseDef = baseById.get(apiDef.Id);
    const currDef = currById.get(apiDef.Id);
    if (baseDef && currDef && !defsEqual(baseDef, currDef)) {
      // Pending local edit — keep it. If the server also changed this
      // definition meanwhile, the save merge arbitrates by stamp
      // (ServerKnewBetter) and the adopted save response corrects us.
      mergedDefs.push(currDef);
      hasPendingEdits = true;
      continue;
    }
    if (baseDef && !currDef) {
      // Pending local delete.
      if (serverChangedSince(apiDef, baseDef)) {
        // The server edited it since we decided to delete — don't delete
        // silently; surface the fresh copy instead (the operator can delete
        // again after seeing it).
        mergedDefs.push(apiDef);
        resurrectedTags.push(apiDef.Tag);
        continue;
      }
      hasPendingEdits = true; // keep the delete pending
      continue;
    }
    // Untouched locally (or unanchored) — the API's copy, stamps and all.
    mergedDefs.push(apiDef);
  }

  // Pending local adds: in the draft, unknown to both the baseline and the
  // server. (A definition in `baseline` but not in the API was deleted
  // server-side — it stays deleted, even over a pending local edit: the
  // server's delete was deliberate and resurrecting rules risks re-tagging.)
  for (const currDef of current.TagSpecDefinitions) {
    if (!apiIds.has(currDef.Id) && !baseById.has(currDef.Id)) {
      mergedDefs.push(currDef);
      hasPendingEdits = true;
    }
  }

  return {
    merged: { ...apiLib, TagSpecDefinitions: mergedDefs },
    hasPendingEdits,
    resurrectedTags,
  };
}
