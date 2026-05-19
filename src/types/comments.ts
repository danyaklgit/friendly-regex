export interface ContextItem {
  Key: string;
  Value: string;
}

export interface TagSpecCommentTarget {
  TagSpecLibraryId: string;
  TagSpecDefinitionId?: string | null;
  TagRuleExpressionId?: string | null;
  AttributeTag?: string | null;
}

export type ReplyStatus = 'ACKNOWLEDGED' | 'RESOLVED' | 'REJECTED';
export type CommentStatus = 'ACTIVE' | string;

export interface TagSpecCommentReply {
  /** Server-assigned id. Optional on legacy data; required for reply-to-reply. */
  Id?: string;
  UserId: string;
  Status: ReplyStatus | string;
  Comment: string;
  CreationDate?: string;
  /** Set when this reply was posted as a response to another reply. */
  ParentReplyId?: string | null;
  /** Mention ids when the reply tags other users. */
  ReportedToUserIds?: string[];
  /** Server may return replies nested. Flatten before rendering. */
  Replies?: TagSpecCommentReply[];
}

export interface TagSpecComment {
  Id: string;
  CreationDate?: string;
  Status: CommentStatus;
  Comment: string;
  ReportedByUserId: string;
  ReportedToUserIds?: string[];
  Context?: ContextItem[];
  Replies?: TagSpecCommentReply[];
  Target: TagSpecCommentTarget;
}

/** Payload for SetTagSpecComment. Id is null to create, set to update. */
export interface SetTagSpecCommentPayload {
  Id: string | null;
  Status: CommentStatus;
  Comment: string;
  ReportedByUserId: string;
  ReportedToUserIds: string[];
  Context?: ContextItem[];
  Target: TagSpecCommentTarget;
}

export interface ReplyPayload {
  UserId: string;
  Status: ReplyStatus | string;
  Comment: string;
  ReportedToUserIds?: string[];
}
