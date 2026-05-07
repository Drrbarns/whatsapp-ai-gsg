// ============================================================================
// WhatsApp webhook for the GSG AI agent.
//
// Pipeline on every inbound message:
//   1. Verify it's a real WhatsApp event
//   2. Persist raw message to agent's own DB (audit trail + dashboard)
//   3. Resolve customer identity from the phone number (GSG profiles/customers)
//   4. Mark message read + show WA typing indicator
//   5. Fetch chat history from GSG chat_conversations
//   6. Build the GSG system prompt (brand, customer, cart, memories)
//   7. Run the multi-round AI tool loop
//   8. Send the AI's text reply via WhatsApp
//   9. Render any follow-up Interactive Messages (product list, cart, etc.)
//  10. Persist the new turn to GSG chat_conversations
// ============================================================================

import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import {
  downloadWhatsAppMedia,
  markWhatsAppMessageRead,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";
import { extFromMime, uploadToStorage } from "@/lib/storage";
import { runAIWithTools, type AIMessage } from "@/lib/ai";
import { resolveWhatsAppIdentity } from "@/lib/gsg-identity";
import { getCart } from "@/lib/gsg-cart";
import { buildGSGSystemPrompt } from "@/lib/gsg-system-prompt";
import {
  persistConversation,
  getMemoriesForCustomer,
} from "@/lib/gsg-persistence";
import { renderHints } from "@/lib/gsg-renderer";
import { gsgAdminDb } from "@/lib/gsg";

export const runtime = "nodejs";
export const maxDuration = 60;

// ───────────────────────────── Webhook verification ─────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (
    sp.get("hub.mode") === "subscribe" &&
    sp.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(sp.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ───────────────────────────── Types ────────────────────────────────────────
type WAMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
};

type WAStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};

// Translates Interactive postback IDs into natural-language user input the LLM understands.
// Note: product UUIDs contain hyphens, so we parse with care. ID format is `prefix:rest`.
function interactiveToText(message: WAMessage): string | null {
  const i = message.interactive;
  if (!i) return null;
  const id = i.button_reply?.id || i.list_reply?.id || "";
  const title = i.button_reply?.title || i.list_reply?.title || "";

  console.log(`[webhook] interactive postback id="${id}" title="${title}"`);

  // Use lastIndexOf to handle UUIDs which contain hyphens, not colons
  if (id.startsWith("add:")) {
    const rest = id.slice(4); // "uuid:qty"
    const lastColon = rest.lastIndexOf(":");
    const productId = lastColon > 0 ? rest.slice(0, lastColon) : rest;
    const qty = lastColon > 0 ? rest.slice(lastColon + 1) : "1";
    return `Please add ${qty || 1} of product id ${productId} to my cart now.`;
  }
  // Customer tapped "Choose options" on a product card with variants
  if (id.startsWith("pickvar:")) {
    const productId = id.slice("pickvar:".length);
    return `Please show me the available options for product id ${productId} so I can choose one.`;
  }
  // Customer tapped a specific variant from the variants list/buttons
  // Format: addvar:productId:variantId:qty
  if (id.startsWith("addvar:")) {
    const rest = id.slice("addvar:".length);
    const parts = rest.split(":");
    // Last part is qty, everything before that is productId:variantId
    const qty = parts.length >= 3 ? parts[parts.length - 1] : "1";
    const variantId = parts.length >= 3 ? parts[parts.length - 2] : "";
    const productId = parts.slice(0, parts.length - 2).join(":");
    if (productId && variantId) {
      return `Please add ${qty || 1} of product id ${productId} (variant id ${variantId}) to my cart now.`;
    }
    return title || id;
  }
  if (id.startsWith("more:")) {
    const productId = id.slice(5);
    return `Tell me more about product id ${productId}.`;
  }
  if (id.startsWith("pick:")) {
    const productId = id.slice(5);
    return `Show me details for product id ${productId}.`;
  }
  if (id === "checkout") return "I'd like to checkout now please.";
  if (id === "add_more") return "I want to keep shopping for more items.";
  if (id === "clear_cart") return "Please clear my cart.";

  return title || id;
}

// ───────────────────────────── POST handler ─────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return Response.json({ status: "no_value" });

  // ─── Status updates → reflect on our messages
  const statuses: WAStatus[] | undefined = value.statuses;
  if (statuses?.length) {
    for (const s of statuses) {
      await supabase
        .from("messages")
        .update({ status: s.status })
        .eq("whatsapp_msg_id", s.id);
    }
    return Response.json({ status: "status_updated" });
  }

  const message: WAMessage | undefined = value.messages?.[0];
  if (!message) return Response.json({ status: "no_message" });

  const phone = message.from;
  const profileName: string | null = value.contacts?.[0]?.profile?.name || null;

  try {
    // ─── 1) Find/create conversation for the dashboard
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();
    let isFirstContact = false;
    if (!conversation) {
      const { data: created } = await supabase
        .from("conversations")
        .insert({ phone, name: profileName })
        .select()
        .single();
      conversation = created;
      isFirstContact = true;
    } else if (profileName && profileName !== conversation.name) {
      await supabase
        .from("conversations")
        .update({ name: profileName })
        .eq("id", conversation.id);
    }
    if (!conversation) {
      return Response.json({ error: "convo_create_failed" }, { status: 500 });
    }

    // ─── 2) Persist inbound to messages table + collect AI input
    const insertRow: Record<string, unknown> = {
      conversation_id: conversation.id,
      role: "user",
      whatsapp_msg_id: message.id,
      status: "delivered",
    };
    let preview = "";
    let previewType = "text";
    let aiUserContent: AIMessage["content"] = "";
    let storedImageUrl: string | null = null;

    if (message.type === "text" && message.text?.body) {
      insertRow.content = message.text.body;
      preview = message.text.body;
      aiUserContent = message.text.body;
    } else if (message.type === "interactive" && message.interactive) {
      const synthetic = interactiveToText(message) ?? "(button)";
      insertRow.content = synthetic;
      preview = synthetic;
      aiUserContent = synthetic;
    } else {
      const meta =
        message.image || message.audio || message.video ||
        message.document || message.sticker;
      if (!meta) {
        return Response.json({ status: "unknown_message_type" });
      }
      const mediaId = (meta as { id: string }).id;
      const caption =
        (message.image?.caption ||
          message.video?.caption ||
          message.document?.caption) ?? null;

      let url = "";
      let mime = (meta as { mime_type?: string }).mime_type || "application/octet-stream";
      try {
        const dl = await downloadWhatsAppMedia(mediaId);
        mime = dl.mime || mime;
        const ext = extFromMime(mime);
        const path = `conversations/${conversation.id}/incoming/${randomUUID()}.${ext}`;
        url = await uploadToStorage({ buffer: dl.buffer, mime, path });
      } catch (err) {
        console.error("media download failed", err);
      }

      const isVoice = !!message.audio?.voice;
      const baseType =
        message.image ? "image" :
        message.video ? "video" :
        message.document ? "document" :
        message.sticker ? "sticker" :
        isVoice ? "voice" : "audio";

      insertRow.media_url = url;
      insertRow.media_type = baseType;
      insertRow.media_mime = mime;
      insertRow.media_filename = message.document?.filename || null;
      insertRow.content = caption;
      preview =
        caption ||
        (baseType === "image" ? "📷 Photo" :
         baseType === "video" ? "🎥 Video" :
         baseType === "voice" ? "🎤 Voice message" :
         baseType === "audio" ? "🎵 Audio" :
         baseType === "document" ? `📎 ${message.document?.filename || "Document"}` :
         baseType === "sticker" ? "Sticker" : "Attachment");
      previewType = baseType;

      if (baseType === "image" && url) {
        storedImageUrl = url;
        aiUserContent = [
          { type: "text", text: caption || "What do you see in this image?" },
          { type: "image_url", image_url: { url } },
        ];
      } else {
        aiUserContent = caption || `[user sent a ${baseType}]`;
      }
    }

    const { error: insertError } = await supabase.from("messages").insert(insertRow);
    if (insertError?.code === "23505") {
      return Response.json({ status: "duplicate" });
    }

    await supabase
      .from("conversations")
      .update({
        updated_at: new Date().toISOString(),
        last_message_preview: preview,
        last_message_type: previewType,
        unread_count: (conversation.unread_count ?? 0) + 1,
      })
      .eq("id", conversation.id);

    // ─── 3) Identity resolution
    const identity = await resolveWhatsAppIdentity(phone);
    console.log(
      `[webhook] from=${identity.normalized.intl} known=${identity.isKnown} email=${identity.email ?? "—"}`
    );

    // ─── 4) Mark read + show WhatsApp typing dots
    const willAutoReply = conversation.mode === "agent";
    markWhatsAppMessageRead(message.id, { typing: willAutoReply }).catch(
      () => {}
    );

    if (!willAutoReply) {
      return Response.json({ status: "stored_for_human" });
    }

    // ─── 4.5) First-contact welcome — once per phone number ever.
    // We send it BEFORE the AI runs so the customer gets an instant friendly
    // ack while the AI is still figuring out a real reply to their question.
    if (isFirstContact) {
      const brandName =
        process.env.NEXT_PUBLIC_BRAND_NAME || "GSG Convenience Goods & More";
      const firstName = identity?.displayName?.split(" ")[0] || profileName?.split(" ")[0] || "";
      const greeting = firstName ? `Hey ${firstName}!` : "Hey there!";
      const welcomeText = `${greeting} 👋 Welcome to ${brandName}. I'm here to help you find products, place orders, or check on existing ones. Give me a sec while I look at your message...`;

      try {
        const sent = await sendWhatsAppMessage(phone, welcomeText);
        if (sent.messages?.[0]?.id) {
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: welcomeText,
            whatsapp_msg_id: sent.messages[0].id,
            status: "sent",
          });
          await supabase
            .from("conversations")
            .update({
              updated_at: new Date().toISOString(),
              last_message_preview: welcomeText.slice(0, 100),
              last_message_type: "text",
            })
            .eq("id", conversation.id);
          console.log(`[webhook] sent welcome to ${phone}`);
        } else if (sent.error) {
          console.warn("[webhook] welcome send failed:", sent.error);
        }
      } catch (err) {
        console.error("[webhook] welcome threw:", err);
      }
    }

    // ─── 5) Dashboard typing indicator ON + fetch chat history from GSG
    await supabase
      .from("conversations")
      .update({ is_typing: true })
      .eq("id", conversation.id);

    let aiReply = "Sorry, I couldn't generate a response.";
    let aiHints: Awaited<ReturnType<typeof runAIWithTools>>["hints"] = [];
    let aiToolNames: string[] = [];

    try {
      // ─── Fetch persistent chat history from GSG chat_conversations
      const gsg = gsgAdminDb();
      const { data: existingConv } = await gsg
        .from("chat_conversations")
        .select("messages")
        .eq("session_id", phone)
        .maybeSingle();

      const persistentHistory: AIMessage[] = (
        (existingConv?.messages as Array<{ role: string; content: string }>) ?? []
      )
        .slice(-18) // keep context tight
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Append the just-arrived message
      persistentHistory.push({ role: "user", content: aiUserContent });

      // ─── 6) Build GSG system prompt (cart + memories injected here)
      const cart = await getCart(phone);
      const memories = await getMemoriesForCustomer({
        email: identity.email,
        phone: identity.normalized.intl,
        customerId: identity.customer?.id,
      });

      const systemPrompt = buildGSGSystemPrompt({
        identity,
        cart: cart.items.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          variant_name: i.variant_name,
        })),
        memories,
        isFirstContact,
      });

      // ─── 7) Run AI with multi-round tool loop
      const aiResult = await runAIWithTools({
        systemPrompt,
        history: persistentHistory,
        ctx: { identity, phone },
      });
      aiReply = aiResult.reply;
      aiHints = aiResult.hints;
      aiToolNames = aiResult.toolCallNames;

      console.log(
        `[webhook] tools=[${aiToolNames.join(",")}] hints=${aiHints.length} reply_len=${aiReply.length}`
      );
    } finally {
      await supabase
        .from("conversations")
        .update({ is_typing: false })
        .eq("id", conversation.id);
    }

    // ─── 8) Send the AI's text reply
    const waResp = await sendWhatsAppMessage(phone, aiReply);
    const waMsgId = waResp.messages?.[0]?.id ?? null;
    const sendError = waResp.error;
    const sendStatus: "sent" | "failed" = waMsgId ? "sent" : "failed";

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: sendError
        ? `${aiReply}\n\n[meta error: ${sendError.code} ${sendError.message}]`
        : aiReply,
      whatsapp_msg_id: waMsgId,
      status: sendStatus,
    });

    // ─── 9) Render any interactive follow-ups (product list, cart, payment CTA)
    if (sendStatus === "sent" && aiHints.length > 0) {
      try {
        await renderHints(phone, aiHints);
      } catch (err) {
        console.error("[webhook] renderHints failed (non-fatal):", err);
      }
    }

    // ─── 10) Persist this turn to GSG chat_conversations
    try {
      const userTextForLog =
        typeof aiUserContent === "string"
          ? aiUserContent
          : aiUserContent
              .map((p) => (p.type === "text" ? p.text : "[image]"))
              .join(" ");

      await persistConversation({
        sessionId: phone,
        identity,
        newMessages: [
          { role: "user", content: userTextForLog },
          { role: "assistant", content: aiReply },
        ],
        intent: aiToolNames[0] ?? undefined,
      });
    } catch (err) {
      console.error("[webhook] persistConversation failed (non-fatal):", err);
    }

    await supabase
      .from("conversations")
      .update({
        updated_at: new Date().toISOString(),
        last_message_preview: aiReply,
        last_message_type: "text",
      })
      .eq("id", conversation.id);

    return Response.json({
      status: sendStatus === "sent" ? "replied" : "send_failed",
      saw_image: !!storedImageUrl,
      meta_error: sendError ?? null,
      tools_called: aiToolNames,
      hints_rendered: aiHints.map((h) => h.kind),
    });
  } catch (error) {
    console.error("Webhook error:", error);
    if (value.contacts?.[0]?.wa_id || value.messages?.[0]?.from) {
      const phoneId = value.contacts?.[0]?.wa_id || value.messages?.[0]?.from;
      await supabase
        .from("conversations")
        .update({ is_typing: false })
        .eq("phone", phoneId);
    }
    return Response.json({ status: "error" }, { status: 500 });
  }
}
