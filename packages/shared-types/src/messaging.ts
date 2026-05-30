export type CommentTargetType = 'cell' | 'row' | 'column' | 'sheet'
export type ChannelType = 'public' | 'private' | 'dm'
export type DigestMode = 'immediate' | 'hourly' | 'daily'
export type NotificationChannel = 'in_app' | 'email' | 'webhook'

export interface Comment {
  id: string
  workspaceId: string
  sheetId: string
  targetType: CommentTargetType
  targetRef: string
  parentId: string | null
  authorId: string
  body: string
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  reactions?: CommentReaction[]
}

export interface CommentReaction {
  commentId: string
  userId: string
  emoji: string
  createdAt: Date
}

export interface Channel {
  id: string
  workspaceId: string
  projectId: string | null
  name: string
  type: ChannelType
  members: string[]
  createdAt: Date
}

export interface Message {
  id: string
  channelId: string
  authorId: string
  body: string
  attachments: MessageAttachment[]
  createdAt: Date
  editedAt: Date | null
}

export interface MessageAttachment {
  filename: string
  s3Key: string
  sizeBytes: number
  mimeType: string
  url?: string  // pre-signed URL, transient
}

export interface Notification {
  id: string
  userId: string
  type: string
  payload: Record<string, unknown>
  read: boolean
  createdAt: Date
}

export interface NotificationPreference {
  userId: string
  notificationType: string
  channel: NotificationChannel
  digestMode: DigestMode
}

export interface PresenceData {
  userId: string
  name: string
  avatar: string | null
  status: 'online' | 'away' | 'offline'
  lastSeen: number  // Unix ms
}
