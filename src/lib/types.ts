// =====================================================================
// Domain types — mirror supabase-schema.sql.
// =====================================================================

export type ConversationMode = "agent" | "human";
export type MessageRole = "user" | "assistant";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MediaType = "image" | "video" | "audio" | "voice" | "document" | "sticker";

export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  avatar_url: string | null;
  mode: ConversationMode;
  unread_count: number;
  last_message_preview: string | null;
  last_message_type: string | null;
  is_typing: boolean;
  updated_at: string;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  media_mime: string | null;
  media_filename: string | null;
  media_size_bytes: number | null;
  media_duration_secs: number | null;
  status: MessageStatus;
  reply_to: string | null;
  whatsapp_msg_id: string | null;
  created_at: string;
}
