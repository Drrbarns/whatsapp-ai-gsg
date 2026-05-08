// ============================================================================
// Executor for escrow-context LLM tool calls.
//
// Each tool call from the LLM produces:
//   { llm: string }          — what gets fed back to the model as a tool result
//   { hint: EscrowRenderHint } — what gets sent to WhatsApp as an interactive UI
//
// Tools are intentionally read-only. Mutations (open dispute, release payment,
// etc.) require ID-verified web auth and happen on the SBBS site.
// ============================================================================

import {
  lookupTransaction,
  listMyTransactions,
  getDisputeByTransaction,
  type EscrowTransaction,
  type EscrowDispute,
} from "./backend-client";
import type { EscrowIdentity } from "./identity";

export type EscrowToolContext = {
  identity: EscrowIdentity;
  /** The customer's WhatsApp number, used to scope every backend query. */
  phone: string;
};

export type EscrowRenderHint =
  | { kind: "transaction_card"; transaction: EscrowTransaction; role: "buyer" | "seller" }
  | { kind: "transaction_list"; transactions: (EscrowTransaction & { role: "buyer" | "seller" })[] }
  | { kind: "dispute_card"; dispute: EscrowDispute; transaction: { short_id: string; status: string } }
  | { kind: "sbbs_cta"; url: string; header: string; body: string }
  | { kind: "none" };

export type EscrowToolExecResult = {
  llm: string;
  hint: EscrowRenderHint;
};

const SBBS_HOME = "https://sellbuysafe.gsgbrands.com.gh";

function normalizeShortId(input: unknown): string {
  const s = String(input || "").trim().toUpperCase();
  if (!s) return "";
  if (s.startsWith("SBS-")) return s;
  // Bare 8 digits → prepend SBS-
  if (/^\d{6,10}$/.test(s)) return `SBS-${s}`;
  return s; // let backend reject if invalid
}

function ghs(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "GH₵?";
  return `GH₵${v.toFixed(2)}`;
}

// ─── Tool: lookup_transaction ───────────────────────────────────────────────
async function toolLookupTransaction(
  ctx: EscrowToolContext,
  args: { short_id: string }
): Promise<EscrowToolExecResult> {
  const sid = normalizeShortId(args.short_id);
  if (!sid) return { llm: JSON.stringify({ error: "missing short_id" }), hint: { kind: "none" } };

  const r = await lookupTransaction(ctx.phone, sid);
  if (!r.ok) {
    return {
      llm: JSON.stringify({ error: "lookup_failed", message: r.error }),
      hint: { kind: "none" },
    };
  }

  if (!r.data.transaction) {
    if (r.data.reason === "not_yours") {
      return {
        llm: JSON.stringify({
          status: "not_yours",
          message:
            "A transaction with that ID exists, but this WhatsApp number isn't on it (you're not the buyer or seller). Tell the customer you can't share details for security/privacy.",
        }),
        hint: { kind: "none" },
      };
    }
    return {
      llm: JSON.stringify({
        status: "not_found",
        message: `No SBBS transaction found with short ID ${sid}. Suggest the customer double-check the ID, or text 'list my transactions' to see what they have.`,
      }),
      hint: { kind: "none" },
    };
  }

  return {
    llm: JSON.stringify({
      status: "found",
      transaction: r.data.transaction,
      role: r.data.role,
    }),
    hint: {
      kind: "transaction_card",
      transaction: r.data.transaction,
      role: r.data.role || "buyer",
    },
  };
}

// ─── Tool: list_my_transactions ─────────────────────────────────────────────
async function toolListMyTransactions(
  ctx: EscrowToolContext,
  args: { limit?: number }
): Promise<EscrowToolExecResult> {
  const r = await listMyTransactions(ctx.phone, args.limit ?? 5);
  if (!r.ok) {
    return {
      llm: JSON.stringify({ error: "list_failed", message: r.error }),
      hint: { kind: "none" },
    };
  }
  if (r.data.count === 0) {
    return {
      llm: JSON.stringify({
        status: "empty",
        message:
          "The customer has no SBBS transactions on this number yet. Suggest they start one at " +
          SBBS_HOME,
      }),
      hint: { kind: "none" },
    };
  }
  return {
    llm: JSON.stringify({
      status: "found",
      count: r.data.count,
      transactions: r.data.transactions.map((t) => ({
        short_id: t.short_id,
        status: t.status,
        product_name: t.product_name,
        grand_total: t.grand_total,
        role: t.role,
      })),
    }),
    hint: { kind: "transaction_list", transactions: r.data.transactions },
  };
}

// ─── Tool: get_dispute_summary ──────────────────────────────────────────────
async function toolGetDisputeSummary(
  ctx: EscrowToolContext,
  args: { short_id: string }
): Promise<EscrowToolExecResult> {
  const sid = normalizeShortId(args.short_id);
  if (!sid) return { llm: JSON.stringify({ error: "missing short_id" }), hint: { kind: "none" } };

  const r = await getDisputeByTransaction(ctx.phone, sid);
  if (!r.ok) {
    return {
      llm: JSON.stringify({ error: "dispute_failed", message: r.error }),
      hint: { kind: "none" },
    };
  }
  if (!r.data.dispute) {
    if (r.data.reason === "transaction_not_found") {
      return {
        llm: JSON.stringify({
          status: "transaction_not_found",
          message: `No SBBS transaction found with short ID ${sid}.`,
        }),
        hint: { kind: "none" },
      };
    }
    if (r.data.reason === "not_yours") {
      return {
        llm: JSON.stringify({
          status: "not_yours",
          message:
            "That transaction exists but this WhatsApp number isn't on it.",
        }),
        hint: { kind: "none" },
      };
    }
    return {
      llm: JSON.stringify({
        status: "no_dispute",
        message: `No dispute has been opened on transaction ${sid}. If the customer wants to open one, send them the open_dispute SBBS link.`,
        transaction_status: r.data.transaction?.status,
      }),
      hint: { kind: "none" },
    };
  }
  return {
    llm: JSON.stringify({
      status: "found",
      dispute: r.data.dispute,
      transaction: r.data.transaction,
    }),
    hint: {
      kind: "dispute_card",
      dispute: r.data.dispute,
      transaction: r.data.transaction!,
    },
  };
}

// ─── Tool: send_sbbs_link ───────────────────────────────────────────────────
async function toolSendSbbsLink(
  _ctx: EscrowToolContext,
  args: { purpose: string; short_id?: string }
): Promise<EscrowToolExecResult> {
  const sid = args.short_id ? normalizeShortId(args.short_id) : "";

  const map: Record<string, { url: string; header: string; body: string }> = {
    open_dispute: {
      url: sid ? `${SBBS_HOME}/hub/${sid}?action=dispute` : `${SBBS_HOME}/hub`,
      header: "Open a dispute",
      body: sid
        ? `To open a dispute on ${sid}, tap below to upload your evidence and tell us what went wrong. A human reviewer will get back to you.`
        : "To open a dispute, sign in and pick the transaction. A human reviewer will follow up.",
    },
    upload_evidence: {
      url: sid ? `${SBBS_HOME}/hub/${sid}` : `${SBBS_HOME}/hub`,
      header: "Upload evidence",
      body: "Tap below to upload photos, screenshots or any other evidence to your transaction. Our team uses these to make a fair decision.",
    },
    complete_kyc: {
      url: `${SBBS_HOME}/hub?tab=kyc`,
      header: "Complete KYC",
      body: "We need a quick KYC check before we can release seller payouts above the cap. Tap below to upload your Ghana Card.",
    },
    view_full_transaction: {
      url: sid ? `${SBBS_HOME}/hub/${sid}` : `${SBBS_HOME}/hub`,
      header: "Open transaction",
      body: "Tap below to see the full timeline, parties, evidence, and payout status for this transaction.",
    },
    start_new_transaction: {
      url: `${SBBS_HOME}/buyer`,
      header: "Start a new transaction",
      body: "Tap below to set up a new protected payment. Tell us what you're buying, who from, and we'll generate a payment link.",
    },
    manage_payouts: {
      url: `${SBBS_HOME}/seller`,
      header: "Manage payouts",
      body: "Sign in to your seller hub to review pending payouts, set your MoMo destination, or check past releases.",
    },
    home: {
      url: SBBS_HOME,
      header: "Sell-Safe Buy-Safe",
      body: "Open the Sell-Safe Buy-Safe site for the full buyer + seller hub.",
    },
  };

  const cfg = map[args.purpose] || map.home;

  return {
    llm: JSON.stringify({
      status: "link_sent",
      message: `A WhatsApp CTA button to ${cfg.url} has been sent. Tell the user briefly to tap the button below.`,
    }),
    hint: { kind: "sbbs_cta", url: cfg.url, header: cfg.header, body: cfg.body },
  };
}

// ─── Public dispatcher ──────────────────────────────────────────────────────
export async function executeEscrowTool(
  ctx: EscrowToolContext,
  name: string,
  argsJson: string
): Promise<EscrowToolExecResult> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return {
      llm: JSON.stringify({ error: "invalid_args_json", raw: argsJson.slice(0, 200) }),
      hint: { kind: "none" },
    };
  }

  switch (name) {
    case "lookup_transaction":
      return toolLookupTransaction(ctx, args as { short_id: string });
    case "list_my_transactions":
      return toolListMyTransactions(ctx, args as { limit?: number });
    case "get_dispute_summary":
      return toolGetDisputeSummary(ctx, args as { short_id: string });
    case "send_sbbs_link":
      return toolSendSbbsLink(ctx, args as { purpose: string; short_id?: string });
    default:
      return {
        llm: JSON.stringify({ error: "unknown_tool", name }),
        hint: { kind: "none" },
      };
  }
}

// Re-export ghs for the renderer
export { ghs };
