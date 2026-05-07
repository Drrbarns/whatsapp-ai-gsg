export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          is_typing: boolean
          last_message_preview: string | null
          last_message_type: string | null
          mode: string
          name: string | null
          phone: string
          unread_count: number
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_typing?: boolean
          last_message_preview?: string | null
          last_message_type?: string | null
          mode?: string
          name?: string | null
          phone: string
          unread_count?: number
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_typing?: boolean
          last_message_preview?: string | null
          last_message_type?: string | null
          mode?: string
          name?: string | null
          phone?: string
          unread_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          media_duration_secs: number | null
          media_filename: string | null
          media_mime: string | null
          media_size_bytes: number | null
          media_type: string | null
          media_url: string | null
          reply_to: string | null
          role: string
          status: string
          whatsapp_msg_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          media_duration_secs?: number | null
          media_filename?: string | null
          media_mime?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          reply_to?: string | null
          role: string
          status?: string
          whatsapp_msg_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          media_duration_secs?: number | null
          media_filename?: string | null
          media_mime?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          reply_to?: string | null
          role?: string
          status?: string
          whatsapp_msg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
