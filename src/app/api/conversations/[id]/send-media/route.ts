import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import {
  sendWhatsAppMedia,
  uploadMediaToWhatsApp,
  type WhatsAppMediaKind,
} from "@/lib/whatsapp";
import { extFromMime, inferMediaType, uploadToStorage } from "@/lib/storage";
import { transcodeToOggOpus } from "@/lib/audio";

export const runtime = "nodejs";
export const maxDuration = 60;

// Multipart upload of a single file → uploads to Supabase Storage,
// uploads to Meta, sends as WhatsApp media, persists message row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");
  const caption = (form.get("caption") as string | null) ?? null;
  const isVoice = form.get("isVoice") === "true";
  const asSticker = form.get("asSticker") === "true";
  const durationStr = form.get("durationSecs") as string | null;
  let durationSecs = durationStr ? Math.max(0, Math.round(Number(durationStr))) : null;

  if (!(file instanceof Blob)) {
    return Response.json({ error: "file is required (multipart)" }, { status: 400 });
  }

  let buffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const originalName = (file as File).name || `upload-${randomUUID()}`;
  let mime = file.type || "application/octet-stream";
  let dashboardName = originalName;

  // ----- Voice notes: transcode to ogg/opus for Meta ------------------
  if (isVoice && !mime.includes("ogg")) {
    try {
      const tx = await transcodeToOggOpus(buffer, mime);
      buffer = tx.buffer;
      mime = tx.mime;
      dashboardName = tx.filename;
      if (durationSecs == null && tx.durationSecs != null) {
        durationSecs = Math.round(tx.durationSecs);
      }
    } catch (e) {
      console.error("voice transcode failed", e);
      // Carry on with the original buffer; Meta will likely reject but
      // local playback in the dashboard will still work.
    }
  }

  // Locate conversation + phone
  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id, phone")
    .eq("id", id)
    .single();
  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 1) Persist to Supabase Storage (so the dashboard always has a stable URL)
  const baseType = isVoice
    ? "voice"
    : asSticker
    ? "sticker"
    : inferMediaType(mime);
  const ext = extFromMime(mime);
  const storagePath = `conversations/${id}/${randomUUID()}.${ext}`;
  let publicUrl: string;
  try {
    publicUrl = await uploadToStorage({ buffer, mime, path: storagePath });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // 2) Forward to Meta and send.
  const kind: WhatsAppMediaKind =
    asSticker
      ? "sticker"
      : baseType === "voice" || baseType === "audio"
      ? "audio"
      : baseType === "image"
      ? "image"
      : baseType === "video"
      ? "video"
      : "document";

  let waStatus: "sent" | "failed" = "sent";
  let waError: string | null = null;
  let waMsgId: string | null = null;
  try {
    const mediaId = await uploadMediaToWhatsApp(buffer, mime, dashboardName);
    const waResp = await sendWhatsAppMedia({
      to: conversation.phone,
      kind,
      mediaId,
      caption: caption ?? undefined,
      filename: kind === "document" ? originalName : undefined,
      isVoice,
    });
    waMsgId =
      (waResp as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;
  } catch (e) {
    waStatus = "failed";
    waError = (e as Error).message;
  }

  // 3) Insert message row
  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: caption,
      media_url: publicUrl,
      media_type: baseType,
      media_mime: mime,
      media_filename: originalName,
      media_size_bytes: buffer.byteLength,
      media_duration_secs: durationSecs,
      whatsapp_msg_id: waMsgId,
      status: waStatus,
    })
    .select()
    .single();
  if (msgError) {
    return Response.json({ error: msgError.message }, { status: 500 });
  }

  // 4) Update conversation preview
  const preview =
    caption ||
    (baseType === "image" ? "Photo" :
     baseType === "video" ? "Video" :
     baseType === "voice" ? "Voice message" :
     baseType === "audio" ? "Audio" :
     baseType === "sticker" ? "Sticker" :
     baseType === "document" ? originalName : "Attachment");

  await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_type: baseType,
    })
    .eq("id", id);

  return Response.json({ message: msg, whatsapp_error: waError });
}
