// ============================================================================
// HTTP client for the SBBS (Sell-Safe Buy-Safe) backend.
//
// The escrow context never queries the escrow Supabase directly — it talks to
// the escrow backend's /api/wa/* endpoints (server-to-server). This keeps all
// business rules (PII scoping, status logic, dispute logic) in one place,
// owned by the escrow team.
//
// Auth model:
//   - Authorization: Bearer ${ESCROW_WA_API_KEY}        (shared secret)
//   - X-WA-Phone:    +233244...                          (the customer asking)
//
// Required env (in the agent's .env):
//   ESCROW_API_BASE_URL  e.g. https://api.sellbuysafe.gsgbrands.com
//   ESCROW_WA_API_KEY    same value as the backend's WA_AGENT_API_KEY
//
// All errors are caught and returned as `{ ok: false, error }` so callers
// (the LLM tools) can produce user-friendly messages instead of crashing.
// ============================================================================

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function escrowBase(): string {
  const u = process.env.ESCROW_API_BASE_URL;
  if (!u) throw new Error("ESCROW_API_BASE_URL is not configured");
  return u.replace(/\/+$/, "");
}

function escrowKey(): string {
  const k = process.env.ESCROW_WA_API_KEY;
  if (!k) throw new Error("ESCROW_WA_API_KEY is not configured");
  return k;
}

async function call<T>(
  path: string,
  phone: string,
  init: RequestInit = {}
): Promise<FetchResult<T>> {
  let url: string;
  try {
    url = `${escrowBase()}${path}`;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    const resp = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${escrowKey()}`,
        "X-WA-Phone": phone,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return {
        ok: false,
        error: `escrow ${path} returned ${resp.status}: ${txt.slice(0, 200)}`,
        status: resp.status,
      };
    }

    const data = (await resp.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: `escrow ${path} threw: ${(err as Error).message}`,
    };
  }
}

// ─── Endpoint wrappers ─────────────────────────────────────────────────────

export type EscrowProfile = {
  user_id: string;
  phone: string;
  full_name: string;
  ghana_card_name: string | null;
  role: "buyer" | "seller" | "rider" | "admin" | "superadmin" | "payout_approver";
  created_at: string;
};

export type EscrowTransaction = {
  short_id: string;
  status: string;
  product_name: string;
  grand_total: number | string;
  product_total: number | string;
  delivery_fee: number | string;
  seller_name: string;
  buyer_name: string;
  delivery_address: string;
  delivery_date: string | null;
  source_platform: string;
  paystack_reference: string | null;
  paystack_authorization_url: string | null;
  created_at: string;
  updated_at: string;
};

export type EscrowDispute = {
  id: string;
  transaction_id: string;
  opened_by: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolution_action: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export function whoami(phone: string) {
  return call<{ profile: EscrowProfile | null }>(
    `/api/wa/whoami`,
    phone,
    { method: "GET" }
  );
}

export function lookupTransaction(phone: string, shortId: string) {
  const q = new URLSearchParams({ short_id: shortId }).toString();
  return call<{
    transaction: EscrowTransaction | null;
    role?: "buyer" | "seller";
    reason?: "not_found" | "not_yours";
  }>(`/api/wa/transactions/lookup?${q}`, phone, { method: "GET" });
}

export function listMyTransactions(phone: string, limit = 10) {
  const q = new URLSearchParams({ limit: String(limit) }).toString();
  return call<{
    transactions: (EscrowTransaction & { role: "buyer" | "seller" })[];
    count: number;
  }>(`/api/wa/transactions/mine?${q}`, phone, { method: "GET" });
}

export function getDisputeByTransaction(phone: string, shortId: string) {
  const q = new URLSearchParams({ short_id: shortId }).toString();
  return call<{
    dispute: EscrowDispute | null;
    transaction?: { short_id: string; status: string };
    reason?: "transaction_not_found" | "not_yours";
  }>(`/api/wa/disputes/by-transaction?${q}`, phone, { method: "GET" });
}
