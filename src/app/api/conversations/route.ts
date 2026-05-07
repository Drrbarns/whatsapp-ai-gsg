import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Backfill last_message_preview for old rows that don't have it stored yet.
  const withPreview = await Promise.all(
    (conversations || []).map(async (convo) => {
      if (convo.last_message_preview) {
        return { ...convo, last_message: convo.last_message_preview };
      }
      const { data: messages } = await supabase
        .from("messages")
        .select("content, role, media_type, media_filename, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const m = messages?.[0];
      const preview = !m
        ? null
        : m.content
        ? m.content
        : m.media_type === "image"
        ? "📷 Photo"
        : m.media_type === "video"
        ? "🎥 Video"
        : m.media_type === "voice"
        ? "🎤 Voice message"
        : m.media_type === "audio"
        ? "🎵 Audio"
        : m.media_type === "document"
        ? `📎 ${m.media_filename || "Document"}`
        : null;
      return {
        ...convo,
        last_message: preview,
        last_message_preview: preview,
        last_message_type: m?.media_type || (m?.content ? "text" : null),
      };
    })
  );

  return Response.json(withPreview);
}
