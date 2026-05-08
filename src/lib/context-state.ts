// ============================================================================
// Tracks which "context" (goods | escrow | brand) is currently active for
// each WhatsApp phone number. Persists on the agent's own Supabase, on the
// `conversations` table that already exists (we added an `active_context`
// column in the additive migration in supabase-schema.sql).
//
// Why we need this:
//   The same WhatsApp number serves three different products. Once a customer
//   has signalled what they want ("I want to buy rice" → goods), we want
//   subsequent messages from them to stay in that context until they
//   explicitly switch ("menu" / "I have a transaction question" / "back to GSG").
//
// Defensive behaviour:
//   - If the column is missing (older install), we silently default to "brand"
//     so the agent keeps working while the user runs the migration.
//   - All errors are logged but never thrown — routing should never block on
//     a state-store hiccup.
// ============================================================================

import { supabase } from "./supabase";

export type ContextKey = "goods" | "escrow" | "brand";

export const DEFAULT_CONTEXT: ContextKey = "brand";

/** Read the active context for a phone number. Returns DEFAULT_CONTEXT on miss. */
export async function getActiveContext(phone: string): Promise<ContextKey> {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("active_context")
      .eq("phone", phone)
      .maybeSingle();

    if (error) {
      console.warn(
        "[context-state] read failed (likely missing column) — defaulting to",
        DEFAULT_CONTEXT,
        error.message
      );
      return DEFAULT_CONTEXT;
    }
    const ctx = (data?.active_context as ContextKey | undefined) ?? DEFAULT_CONTEXT;
    return isContextKey(ctx) ? ctx : DEFAULT_CONTEXT;
  } catch (err) {
    console.warn("[context-state] read threw — defaulting:", err);
    return DEFAULT_CONTEXT;
  }
}

/** Set the active context for a phone number. Silently no-ops on failure. */
export async function setActiveContext(
  phone: string,
  ctx: ContextKey,
  reason: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("conversations")
      .update({
        active_context: ctx,
        context_switched_at: new Date().toISOString(),
        context_switch_reason: reason,
      })
      .eq("phone", phone);

    if (error) {
      console.warn(
        "[context-state] write failed (likely missing column):",
        error.message
      );
    } else {
      console.log(`[context-state] ${phone} → ${ctx} (${reason})`);
    }
  } catch (err) {
    console.warn("[context-state] write threw:", err);
  }
}

function isContextKey(s: string): s is ContextKey {
  return s === "goods" || s === "escrow" || s === "brand";
}
