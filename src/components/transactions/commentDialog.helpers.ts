import type { TransactionRow } from '../../types';

export interface CommentPayloadEntry {
  Id: string;
  Comment: string;
}

export function getRowId(row: TransactionRow): string {
  return String(row['Id'] ?? '');
}

export function hasComment(row: TransactionRow): boolean {
  const c = row['Comment'];
  return typeof c === 'string' && c.trim().length > 0;
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

export interface BuildPayloadInput {
  rowsWithoutComment: TransactionRow[];
  bulkComment: string;
  perRowComments: Map<string, string>;
}

export function buildPayload({
  rowsWithoutComment,
  bulkComment,
  perRowComments,
}: BuildPayloadInput): CommentPayloadEntry[] {
  const entries: CommentPayloadEntry[] = [];
  const trimmedBulk = bulkComment.trim();
  if (trimmedBulk) {
    for (const r of rowsWithoutComment) {
      const id = getRowId(r);
      if (id) entries.push({ Id: id, Comment: trimmedBulk });
    }
  }
  for (const [id, comment] of perRowComments.entries()) {
    const trimmed = comment.trim();
    if (id && trimmed) entries.push({ Id: id, Comment: trimmed });
  }
  return entries;
}
