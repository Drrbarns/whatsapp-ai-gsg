// ============================================================================
// Phone-based customer identity for GSG.
//
// When a WhatsApp message arrives from +233 XX XXX XXXX, we resolve it to:
//   - profiles row  (logged-in user account, optional)
//   - customers row (purchase history & contact info, optional)
//
// Backed by the find_user_by_whatsapp_phone(p_wa_id) RPC on GSG Supabase.
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
  /** Convenience: best-known display name */
  displayName: string | null;
  /** Convenience: best-known email */
  email: string | null;
  /** Convenience: true if this WhatsApp number maps to ANY known GSG contact */
  isKnown: boolean;
};

/**
 * Resolve a WhatsApp wa_id (Meta sends e.g. "233535998837" with no plus)
 * to a GSG profile/customer. Returns identity object even if no match
 * (with isKnown=false) so callers can still get the normalized formats
 * for greeting/upserting.
 */
export async function resolveWhatsAppIdentity(
  waId: string
): Promise<GSGIdentity> {
  const db = gsgAdminDb();
  const { data, error } = await db.rpc("find_user_by_whatsapp_phone", {
    p_wa_id: waId,
  });

  if (error) {
    console.error("[gsg-identity] RPC failed:", error.message);
  }

  if (!data) {
    // No match — still return normalized formats so caller can proceed
    const cleaned = waId.replace(/\D/g, "");
    let local = cleaned;
    if (cleaned.length === 12 && cleaned.startsWith("233")) {
      local = cleaned.slice(3);
    } else if (cleaned.length === 10 && cleaned.startsWith("0")) {
      local = cleaned.slice(1);
    } else if (cleaned.length === 9) {
      local = cleaned;
    }
    return {
      profile: null,
      customer: null,
      normalized: {
        intl: `+233${local}`,
        local: `0${local}`,
        digits9: local,
      },
      displayName: null,
      email: null,
      isKnown: false,
    };
  }

  const result = data as {
    profile: GSGIdentityProfile | null;
    customer: GSGIdentityCustomer | null;
    normalized: { intl: string; local: string; digits9: string };
  };

  return {
    profile: result.profile,
    customer: result.customer,
    normalized: result.normalized,
    displayName: result.profile?.full_name ?? result.customer?.full_name ?? null,
    email: result.profile?.email ?? result.customer?.email ?? null,
    isKnown: Boolean(result.profile || result.customer),
  };
}
