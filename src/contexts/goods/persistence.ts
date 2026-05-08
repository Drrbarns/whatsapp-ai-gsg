// ============================================================================
// Persist WhatsApp conversations and AI memories to GSG's chat_conversations.
//
// One row per session_id (== phone number for WhatsApp). Messages array
// is upserted as JSONB so we can keep the full conversation history.
// ============================================================================

import { gsgAdminDb } from "./db";
import type { GSGIdentity } from "./identity";

export type PersistMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  tool_calls?: unknown;
};

export async function persistConversation(opts: {
  sessionId: string; // we use the phone number
  identity: GSGIdentity;
  newMessages: PersistMessage[]; // just the latest user + assistant pair
  intent?: string;
  category?: string;
}): Promise<void> {
  const db = gsgAdminDb();
  const { sessionId, identity, newMessages } = opts;

  const { data: existing } = await db
    .from("chat_conversations")
    .select("id, messages, message_count")
    .eq("session_id", sessionId)
    .maybeSingle();

  const stamped = newMessages.map((m) => ({
    ...m,
    timestamp: m.timestamp ?? new Date().toISOString(),
  }));

  if (existing) {
    const merged = [...((existing.messages as PersistMessage[]) ?? []), ...stamped];
    await db
      .from("chat_conversations")
      .update({
        messages: merged,
        message_count: (existing.message_count ?? 0) + stamped.length,
        updated_at: new Date().toISOString(),
        ...(opts.intent ? { intent: opts.intent } : {}),
        ...(opts.category ? { category: opts.category } : {}),
        customer_email: identity.email,
        customer_name: identity.displayName,
        whatsapp_phone: identity.normalized.intl,
        user_id: identity.profile?.id ?? null,
      })
      .eq("id", existing.id);
  } else {
    await db.from("chat_conversations").insert({
      session_id: sessionId,
      messages: stamped,
      message_count: stamped.length,
      channel: "whatsapp",
      ai_handled: true,
      customer_email: identity.email,
      customer_name: identity.displayName,
      whatsapp_phone: identity.normalized.intl,
      user_id: identity.profile?.id ?? null,
      ...(opts.intent ? { intent: opts.intent } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    });
  }
}

export type AIMemory = { content: string; importance: string };

export async function getMemoriesForCustomer(opts: {
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
}): Promise<AIMemory[]> {
  if (!opts.email && !opts.phone && !opts.customerId) return [];
  const db = gsgAdminDb();
  const { data, error } = await db.rpc("get_ai_memories", {
    p_customer_id: opts.customerId ?? null,
    p_customer_email: opts.email ?? null,
    p_customer_phone: opts.phone ?? null,
  });
  if (error || !data) return [];
  // RPC returns jsonb array of {id, type, content, importance, created_at}
  return (data as Array<{ content: string; importance: string }>).slice(0, 5);
}

export async function saveMemory(opts: {
  identity: GSGIdentity;
  content: string;
  importance?: "low" | "normal" | "high" | "critical";
  memoryType?: string;
  expiresAt?: string | null;
}): Promise<void> {
  const db = gsgAdminDb();
  await db.from("ai_memory").insert({
    customer_id: opts.identity.customer?.id ?? null,
    customer_email: opts.identity.email,
    customer_phone: opts.identity.normalized.intl,
    memory_type: opts.memoryType ?? "context",
    content: opts.content,
    importance: opts.importance ?? "normal",
    expires_at: opts.expiresAt ?? null,
  });
}
