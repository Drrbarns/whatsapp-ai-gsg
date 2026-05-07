import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { message } = body;

  if (!message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone")
    .eq("id", id)
    .single();
  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  let waMsgId: string | null = null;
  let status: "sent" | "failed" = "sent";
  try {
    const waResp = await sendWhatsAppMessage(conversation.phone, message);
    waMsgId = (waResp as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;
  } catch {
    status = "failed";
  }

  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: message,
      whatsapp_msg_id: waMsgId,
      status,
    })
    .select()
    .single();
  if (msgError) {
    return Response.json({ error: msgError.message }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      last_message_preview: message,
      last_message_type: "text",
    })
    .eq("id", id);

  return Response.json(msg);
}
