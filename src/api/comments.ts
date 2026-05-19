import type { TepHeaders } from './transactions';
import { throwIfNotOk } from './apiError';
import { buildHeaders } from './checkout';
import type {
  TagSpecComment,
  TagSpecCommentTarget,
  SetTagSpecCommentPayload,
  ReplyPayload,
} from '../types/comments';

const BASE = '/api/tep/api/v1/TEP';

interface GetTagSpecCommentsResponse {
  Comments?: TagSpecComment[];
  SFM?: {
    Constant?: string | null;
    Major?: { Constant?: string | null };
  };
}

/**
 * Backend returns a non-2xx status with SFM constant
 * `SFM_NO_TAG_SPEC_COMMENTS_FOUND` when the target simply has no comments
 * yet. That's a valid "empty" response, not an error — we read the body
 * first and short-circuit to an empty array so the UI stops retrying.
 */
export async function getTagSpecComments(
  target: TagSpecCommentTarget,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagSpecComment[]> {
  const res = await fetch(`${BASE}/GetTagSpecComments`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetTagSpecComments'),
    body: JSON.stringify({ Target: target }),
    signal,
  });
  let json: GetTagSpecCommentsResponse | null = null;
  try {
    json = (await res.clone().json()) as GetTagSpecCommentsResponse;
  } catch {
    json = null;
  }
  if (json && json.SFM?.Constant === 'SFM_NO_TAG_SPEC_COMMENTS_FOUND') {
    return [];
  }
  await throwIfNotOk(res, 'Failed to load comments');
  return json?.Comments ?? [];
}

export async function setTagSpecComment(
  comment: SetTagSpecCommentPayload,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/SetTagSpecComment`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SetTagSpecComment'),
    body: JSON.stringify({ Comment: comment }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save comment');
}

export async function replyTagSpecComment(
  commentId: string,
  reply: ReplyPayload,
  token: string,
  tepHeaders: TepHeaders,
  options?: { parentReplyId?: string | null; signal?: AbortSignal },
): Promise<void> {
  const mentionIds = reply.ReportedToUserIds ?? [];
  const res = await fetch(`${BASE}/ReplyTagSpecComment`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'ReplyTagSpecComment'),
    body: JSON.stringify({
      CommentId: commentId,
      ParentReplyId: options?.parentReplyId ?? null,
      ReportedToUserIds: mentionIds,
      Reply: { ...reply, ReportedToUserIds: mentionIds },
    }),
    signal: options?.signal,
  });
  await throwIfNotOk(res, 'Failed to add reply');
}
