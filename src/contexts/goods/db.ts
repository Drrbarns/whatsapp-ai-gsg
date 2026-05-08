// ============================================================================
// GSG Convenience Goods & More (GSG) Supabase client.
//
// This is a SEPARATE Supabase project from the WhatsApp agent's own DB.
// It contains GSG's live e-commerce data: products, orders, customers, etc.
//
// SAFETY RULES (enforced by code review, not by the runtime):
//   - This client uses the service-role key, which bypasses RLS.
//   - The webhook code MUST limit writes to: chat_conversations, ai_memory,
//     support_tickets, support_messages, support_knowledge_base.
//   - NEVER write to: products, orders, order_items, customers, profiles,
//     product_variants, product_images, inventory, or any other GSG business
//     tables. Order creation is delegated to GSG's /api/storefront/orders/create
//     HTTP endpoint so GSG's own validation/stock logic stays in charge.
//   - All reads are fine.
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _gsgAdmin: SupabaseClient | null = null;

/**
 * Service-role client for the GSG Supabase project.
 * Bypasses RLS — handle with care. See the safety rules at the top of the file.
 */
export function gsgAdminDb(): SupabaseClient {
  if (_gsgAdmin) return _gsgAdmin;
  const url = process.env.GSG_SUPABASE_URL;
  const key = process.env.GSG_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "GSG Supabase client requires GSG_SUPABASE_URL and GSG_SUPABASE_SERVICE_ROLE_KEY in env"
    );
  }
  _gsgAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "wa-agent-gsg" } },
    db: { schema: "public" },
  });
  return _gsgAdmin;
}

/** Returns true if GSG env vars are configured. */
export function gsgConfigured(): boolean {
  return Boolean(
    process.env.GSG_SUPABASE_URL && process.env.GSG_SUPABASE_SERVICE_ROLE_KEY
  );
}
