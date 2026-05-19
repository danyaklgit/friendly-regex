export type NotificationStatus = 'UNREAD' | 'READ' | 'DELETED';
export type NotificationType = 'TAG_SPEC_COMMENT' | 'TAG_SPEC_COMMENT_REPLY' | string;

export interface UserNotificationAction {
  ActionName: string;
  ActionId: string;
  ActionPayload?: Record<string, string>;
}

export interface UserNotification {
  Id: string;
  UserId: string;
  Type: NotificationType;
  Status: NotificationStatus | string;
  CreationDate?: string;
  Title: string;
  Body: string;
  Action?: UserNotificationAction;
}
