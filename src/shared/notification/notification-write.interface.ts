export interface NotificationWriteInput {
  receiverId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  targetType?: string | null;
  targetId?: string | null;
}
