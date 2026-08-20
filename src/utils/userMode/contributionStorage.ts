/**
 * Per-user contributions storage for the user-mode portal.
 *
 * Each contribution captures a single tag change the user made to a transaction
 * row: original tag/groups, new tag/groups, whether they saved it for themselves
 * or submitted for review, optional reason, contribution timestamp.
 *
 * Storage shape:
 *   localStorage[`tep:userContributions:${userId}`] = JSON.stringify(Contribution[])
 *
 * Per-user scoping means user A's contributions don't show in user B's "My
 * Contributions" when they share a browser. The price is one localStorage key
 * per user-id ever logged in on this device — small price for a demo surface.
 *
 * Custom tags are stored elsewhere (see `customTagsStorage.ts`) — they're
 * device-wide by design.
 */

export interface Contribution {
  /** String form of the row's identifier field (whatever `fieldMeta.identifierField` points to). */
  transactionId: string;
  /** Captured at contribution time for the My Contributions modal's REFERENCE column. */
  bankReference: string;
  /** Captured at contribution time so the modal can show the row's date without re-fetching. */
  entryDate: string;
  /** The tag the row was showing when the user opened the tag picker. `null` when the row had no matched tag. */
  originalTag: string | null;
  /** Groups the original tag belonged to. Empty array when the row was untagged. */
  originalGroups: string[];
  /** The tag the user chose (existing or freshly created). */
  newTag: string;
  /** Groups for the new tag (single-element when the user just created it). */
  newGroups: string[];
  /** True when the user created `newTag` via the "Create new tag" affordance. */
  newTagIsCustom: boolean;
  /** Which path the user took at the contribution dialog. */
  saveType: 'self' | 'review';
  /** Required for `review`, undefined for `self`. */
  reason?: string;
  /** ISO timestamp of when the contribution was committed. */
  contributionDate: string;
}

import { settingsStore } from '../settingsStore';

function keyFor(userId: string): string {
  return `tep:userContributions:${userId}`;
}

export function loadContributions(userId: string | null): Contribution[] {
  if (!userId) return [];
  try {
    const raw = settingsStore.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Contribution[]) : [];
  } catch {
    return [];
  }
}

export function saveContributions(userId: string | null, contributions: Contribution[]): void {
  if (!userId) return;
  try {
    settingsStore.setItem(keyFor(userId), JSON.stringify(contributions));
  } catch {
    console.warn('[contributionStorage] localStorage write failed');
  }
}
