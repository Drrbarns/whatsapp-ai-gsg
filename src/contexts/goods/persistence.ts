// ============================================================================
// Persist WhatsApp conversations and AI memories to the GSG storefront DB.
//
// The storefront's `chat_conversations` schema (see migrations/001) uses
// `phone` + `history` (jsonb) — NOT the `session_id`/`messages` shape used
// by older clones of this agent. Earlier versions of this file wrote to the
// wrong columns, causing every write to silently fail. This file is now
// aligned with the live schema and is fully defensive: any error logs but
// never throws, because conversation persistence must never block the reply.
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
  /** WhatsApp phone in international format (e.g. +233246033792). */
  sessionId: string;
  identity: GSGIdentity;
  newMessages: PersistMessage[];
  intent?: string;
  category?: string;
}): Promise<void> {
  const db = gsgAdminDb();
  const phone = opts.identity.normalized.intl || opts.sessionId;

  try {
    const { data: existing, error: selErr } = await db
      .from("chat_conversations")
      .select("id, history, message_count, metadata")
      .eq("phone", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selErr) {
      console.warn("[persistConversation] select failed:", selErr.message);
      return;
    }

    const stamped = opts.newMessages.map((m) => ({
      ...m,
      timestamp: m.timestamp ?? new Date().toISOString(),
    }));

    const meta = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      ai_handled: true,
      customer_email: opts.identity.email ?? null,
      customer_name: opts.identity.displayName ?? null,
      ...(opts.intent ? { last_intent: opts.intent } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    };

    if (existing) {
      const merged = [
        ...(((existing.history as PersistMessage[]) ?? []) as PersistMessage[]),
        ...stamped,
      ];
      const { error: updErr } = await db
        .from("chat_conversations")
        .update({
          history: merged,
          message_count: (existing.message_count ?? 0) + stamped.length,
          metadata: meta,
          customer_id: opts.identity.customer?.id ?? null,
          user_id: opts.identity.profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) {
        console.warn("[persistConversation] update failed:", updErr.message);
      }
    } else {
      const { error: insErr } = await db.from("chat_conversations").insert({
        phone,
        channel: "whatsapp",
        history: stamped,
        message_count: stamped.length,
        metadata: meta,
        customer_id: opts.identity.customer?.id ?? null,
        user_id: opts.identity.profile?.id ?? null,
      });
      if (insErr) {
        console.warn("[persistConversation] insert failed:", insErr.message);
      }
    }
  } catch (err) {
    console.error("[persistConversation] unexpected error:", err);
  }
}

export type AIMemory = { content: string; importance: string };

export async function getMemoriesForCustomer(opts: {
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
}): Promise<AIMemory[]> {
  if (!opts.phone && !opts.customerId && !opts.email) return [];
  try {
    const db = gsgAdminDb();
    // Migration 001 defines get_ai_memories(p_phone text, p_limit int).
    if (!opts.phone) return [];
    const { data, error } = await db.rpc("get_ai_memories", {
      p_phone: opts.phone,
      p_limit: 5,
    });
    if (error || !data) return [];
    return (
      data as Array<{ content: string; importance: number | string }>
    ).map((m) => ({
      content: m.content,
      importance:
        typeof m.importance === "number"
          ? String(m.importance)
          : (m.importance ?? "normal"),
    }));
  } catch (err) {
    console.warn("[getMemoriesForCustomer] failed:", err);
    return [];
  }
}

export async function saveMemory(opts: {
  identity: GSGIdentity;
  content: string;
  importance?: "low" | "normal" | "high" | "critical";
  memoryType?: string;
  expiresAt?: string | null;
}): Promise<void> {
  if (!opts.content?.trim()) return;
  try {
    const db = gsgAdminDb();
    // Migration 001 defines ai_memory(phone, customer_id, category, content,
    // importance int, metadata, expires_at).
    const importanceMap: Record<string, number> = {
      low: 3,
      normal: 5,
      high: 7,
      critical: 9,
    };
    const { error } = await db.from("ai_memory").insert({
      phone: opts.identity.normalized.intl,
      customer_id: opts.identity.customer?.id ?? null,
      category: opts.memoryType ?? "context",
      content: opts.content,
      importance: importanceMap[opts.importance ?? "normal"] ?? 5,
      expires_at: opts.expiresAt ?? null,
    });
    if (error) console.warn("[saveMemory] failed:", error.message);
  } catch (err) {
    console.error("[saveMemory] unexpected error:", err);
  }
}
