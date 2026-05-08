// ============================================================================
// Phone-based customer identity for GSG.
//
// When a WhatsApp message arrives from +233 XX XXX XXXX, we resolve it to:
//   - customer  (a row in customers)
//   - profile   (a row in profiles, when the customer has a logged-in account)
//
// Backed by the find_user_by_whatsapp_phone(p_wa_id) RPC on GSG storefront
// Supabase. The RPC returns a TABLE (rows array) of:
//   { customer_id, user_id, display_name, email, phone }
//
// We do phone normalization in TypeScript (not in the RPC) so any caller can
// rely on `identity.normalized` even when the customer is unknown.
// ============================================================================

import { gsgAdminDb } from "./db";

export type GSGIdentityProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

export type GSGIdentityCustomer = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  user_id: string | null;
};

export type GSGIdentity = {
  profile: GSGIdentityProfile | null;
  customer: GSGIdentityCustomer | null;
  normalized: { intl: string; local: string; digits9: string };
  displayName: string | null;
  email: string | null;
  isKnown: boolean;
};

function normalizePhone(
  waId: string
): { intl: string; local: string; digits9: string } {
  const cleaned = (waId || "").replace(/\D/g, "");
  let nine = cleaned;
  if (cleaned.length === 12 && cleaned.startsWith("233")) {
    nine = cleaned.slice(3);
  } else if (cleaned.length === 10 && cleaned.startsWith("0")) {
    nine = cleaned.slice(1);
  } else if (cleaned.length === 9) {
    nine = cleaned;
  }
  return {
    intl: `+233${nine}`,
    local: `0${nine}`,
    digits9: nine,
  };
}

/**
 * Resolve a WhatsApp wa_id (Meta sends e.g. "233209636158" with no plus)
 * to a GSG customer record. Returns the identity object even when no match
 * is found (isKnown=false) so callers can still greet / upsert / etc.
 */
export async function resolveWhatsAppIdentity(
  waId: string
): Promise<GSGIdentity> {
  const normalized = normalizePhone(waId);

  const db = gsgAdminDb();
  const { data, error } = await db.rpc("find_user_by_whatsapp_phone", {
    p_wa_id: waId,
  });

  if (error) {
    console.error("[gsg-identity] RPC failed:", error.message);
  }

  // RPC returns an array of {customer_id, user_id, display_name, email, phone}
  // (Postgres TABLE-returning function). We expect 0 or 1 row.
  const row =
    Array.isArray(data) && data.length > 0
      ? (data[0] as {
          customer_id: string | null;
          user_id: string | null;
          display_name: string | null;
          email: string | null;
          phone: string | null;
        })
      : null;

  if (!row || !row.customer_id) {
    return {
      profile: null,
      customer: null,
      normalized,
      displayName: null,
      email: null,
      isKnown: false,
    };
  }

  const customer: GSGIdentityCustomer = {
    id: row.customer_id,
    email: row.email,
    full_name: row.display_name,
    phone: row.phone,
    user_id: row.user_id,
  };

  // GSG storefront does have a separate profiles table for logged-in shoppers.
  // The RPC already joins customers ↔ profiles via auth.users; if the customer
  // has a linked user_id we surface a thin profile so the rest of the agent
  // (system prompt, memory key, etc.) can use it without changes.
  const profile: GSGIdentityProfile | null = row.user_id
    ? {
        id: row.user_id,
        email: row.email,
        full_name: row.display_name,
        phone: row.phone,
        role: "customer",
      }
    : null;

  return {
    profile,
    customer,
    normalized,
    displayName: row.display_name,
    email: row.email,
    isKnown: true,
  };
}
