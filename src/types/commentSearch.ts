import type { CommentStatus, TagSpecCommentTarget } from './comments';

/** Mirror of the backend SearchTagSpecComments request body. */
export interface SearchTagSpecCommentsRequest {
  SearchText: string;
  /** Omit entirely (or pass null) to search across all libraries. Any field
   *  left null inside Target acts as a wildcard. */
  Target?: TagSpecCommentTarget | null;
}

/** One match returned by SearchTagSpecComments. The match may itself be a root
 *  comment (Depth === 0) or a reply (Depth >= 1). */
export interface TagSpecCommentSearchResult {
  /** ObjectId of the matched comment or reply. */
  Id: string;
  /** ObjectId of the top-level comment this result belongs to. Equals Id when
   *  the match is the root comment itself. */
  RootCommentId: string;
  /** Ordered list of comment ids from the root down to this result. Empty for
   *  a root match. */
  ReplyPath: string[];
  /** Full text of the matched comment or reply. */
  Comment: string;
  /** User id of the author. Resolve via AuthContext.usersMap for the display
   *  name. */
  AuthorUserId: string;
  /** UTC ISO timestamp. */
  CreationDate: string;
  Status: CommentStatus | string;
  /** Target of the root comment, with nulls for absent fields. */
  Target: TagSpecCommentTarget;
  /** Short preview of the root comment, useful when this result is a deep
   *  reply and we want to show its parent context. */
  RootCommentPreview: string;
  /** 0 = root, 1 = direct reply, 2+ = nested reply. */
  Depth: number;
}

export interface SearchTagSpecCommentsResponse {
  Results: TagSpecCommentSearchResult[];
  SFM?: unknown;
}
