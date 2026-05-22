import type { TepHeaders } from './transactions';
import { throwIfNotOk } from './apiError';
import { buildHeaders } from './checkout';
import type { TagSpecCommentTarget } from '../types/comments';
import type {
  SearchTagSpecCommentsRequest,
  SearchTagSpecCommentsResponse,
  TagSpecCommentSearchResult,
} from '../types/commentSearch';

const BASE = '/api/tep/api/v1/TEP';

/** Normalise a Target so absent fields become explicit null, matching what the
 *  backend expects for the SearchTagSpecComments contract. Null wildcards each
 *  level the caller doesn't set. */
function normaliseSearchTarget(target: TagSpecCommentTarget | null | undefined): TagSpecCommentTarget | null {
  if (!target) return null;
  return {
    TagSpecLibraryId: target.TagSpecLibraryId,
    TagSpecDefinitionId: target.TagSpecDefinitionId ?? null,
    TagRuleExpressionId: target.TagRuleExpressionId ?? null,
    AttributeTag: target.AttributeTag ?? null,
  };
}

/**
 * Full-text search across TagSpec comments and replies. Pass `target = null`
 * to search globally; pass a Target with only `TagSpecLibraryId` set to scope
 * to that library. Each Target field left null acts as a wildcard.
 *
 * Backend may return `SFM_NO_TAG_SPEC_COMMENTS_FOUND` on a non-2xx status when
 * the search produced zero hits — that's treated as an empty result, not an
 * error, mirroring the GetTagSpecComments behaviour.
 */
export async function searchTagSpecComments(
  searchText: string,
  target: TagSpecCommentTarget | null,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagSpecCommentSearchResult[]> {
  const normalised = normaliseSearchTarget(target);
  // Omit Target from the payload entirely when there is no scope (Backlog
  // global search). Sending `Target: null` works but is noisier than needed.
  const body: SearchTagSpecCommentsRequest = normalised
    ? { SearchText: searchText, Target: normalised }
    : { SearchText: searchText };
  const res = await fetch(`${BASE}/SearchTagSpecComments`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SearchTagSpecComments'),
    body: JSON.stringify(body),
    signal,
  });
  let json: SearchTagSpecCommentsResponse | null = null;
  try {
    json = (await res.clone().json()) as SearchTagSpecCommentsResponse;
  } catch {
    json = null;
  }
  const sfmConstant = (json as unknown as { SFM?: { Constant?: string | null } } | null)?.SFM?.Constant ?? null;
  if (sfmConstant === 'SFM_NO_TAG_SPEC_COMMENTS_FOUND') {
    return [];
  }
  await throwIfNotOk(res, 'Failed to search comments');
  return json?.Results ?? [];
}
