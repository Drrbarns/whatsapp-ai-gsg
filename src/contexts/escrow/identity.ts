// ============================================================================
// Resolve a WhatsApp phone number to an SBBS profile.
//
// Calls /api/wa/whoami on the escrow backend (which scopes the lookup to the
// X-WA-Phone header).
//
// This is intentionally separate from the goods context's identity resolver:
//   - Goods looks up against the GSG storefront DB
//   - Escrow looks up against the SBBS Supabase
// A customer can be on both, neither, or one.
// ============================================================================

import { whoami, type EscrowProfile } from "./backend-client";

export type EscrowIdentity = {
  isKnown: boolean;
  /** Friendly name we can address the customer by */
  displayName: string | null;
  /** "buyer" | "seller" | etc — useful for the system prompt to tailor voice */
  role: EscrowProfile["role"] | null;
  profile: EscrowProfile | null;
  /** Always present — what the customer texted us from */
  phone: string;
};

export async function resolveEscrowIdentity(phone: string): Promise<EscrowIdentity> {
  const result = await whoami(phone);
  if (!result.ok) {
    console.warn("[escrow-identity] whoami failed:", result.error);
    return {
      isKnown: false,
      displayName: null,
      role: null,
      profile: null,
      phone,
    };
  }
  const profile = result.data.profile;
  if (!profile) {
    return { isKnown: false, displayName: null, role: null, profile: null, phone };
  }
  return {
    isKnown: true,
    displayName: profile.full_name?.trim() || profile.ghana_card_name?.trim() || null,
    role: profile.role,
    profile,
    phone,
  };
}
