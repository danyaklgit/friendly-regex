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
  UserId: string;
  Status: ReplyStatus | string;
  Comment: string;
  CreationDate?: string;
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
}
