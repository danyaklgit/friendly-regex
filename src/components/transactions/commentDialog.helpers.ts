import type { TransactionRow } from '../../types';

export interface CommentPayloadEntry {
  Id: string;
  Comment: string | null;
}

export function getRowId(row: TransactionRow): string {
  return String(row['Id'] ?? '');
}

export function hasComment(row: TransactionRow): boolean {
  const c = row['Comment'];
  return typeof c === 'string' && c.trim().length > 0;
}

export function getRowComment(row: TransactionRow): string {
  const c = row['Comment'];
  return typeof c === 'string' ? c : '';
}

export interface SplitRows {
  rowsWithoutComment: TransactionRow[];
  rowsWithComment: TransactionRow[];
  hasBulkStep: boolean;
  totalSteps: number;
}

export function splitRows(rows: TransactionRow[]): SplitRows {
  const rowsWithoutComment = rows.filter((r) => !hasComment(r));
  const rowsWithComment = rows.filter((r) => hasComment(r));
  const hasBulkStep = rowsWithoutComment.length > 0;
  const totalSteps = (hasBulkStep ? 1 : 0) + rowsWithComment.length;
  return { rowsWithoutComment, rowsWithComment, hasBulkStep, totalSteps };
}

/** Distinct existing comments across the given rows, with occurrence counts,
 *  ordered by first appearance. Used for the read-only summary on step 1. */
export interface DistinctComment {
  comment: string;
  count: number;
}

export function distinctComments(rows: TransactionRow[]): DistinctComment[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = getRowComment(r).trim();
    if (!c) continue;
    if (counts.has(c)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    } else {
      counts.set(c, 1);
      order.push(c);
    }
  }
  return order.map((comment) => ({ comment, count: counts.get(comment) ?? 0 }));
}

/** "Apply to all & finish": write the same comment to every selected row,
 *  overwriting any existing comment. */
export function buildApplyAllPayload(allRows: TransactionRow[], comment: string): CommentPayloadEntry[] {
  const trimmed = comment.trim();
  const entries: CommentPayloadEntry[] = [];
  for (const r of allRows) {
    const id = getRowId(r);
    if (id) entries.push({ Id: id, Comment: trimmed });
  }
  return entries;
}

export interface BuildReviewInput {
  rowsWithoutComment: TransactionRow[];
  bulkComment: string;
  /** Per-row decisions for rows that already had a comment:
   *  absent = keep (no write), string = replace, null = clear. */
  perRow: Map<string, string | null>;
}

/** "Review each" path: the bulk comment lands on the comment-less rows; each
 *  already-commented row is governed by its entry in `perRow`. */
export function buildReviewPayload({
  rowsWithoutComment,
  bulkComment,
  perRow,
}: BuildReviewInput): CommentPayloadEntry[] {
  const entries: CommentPayloadEntry[] = [];
  const trimmedBulk = bulkComment.trim();
  if (trimmedBulk) {
    for (const r of rowsWithoutComment) {
      const id = getRowId(r);
      if (id) entries.push({ Id: id, Comment: trimmedBulk });
    }
  }
  for (const [id, value] of perRow.entries()) {
    if (!id) continue;
    if (value === null) {
      entries.push({ Id: id, Comment: null });
    } else {
      const trimmed = value.trim();
      if (trimmed) entries.push({ Id: id, Comment: trimmed });
    }
  }
  return entries;
}
