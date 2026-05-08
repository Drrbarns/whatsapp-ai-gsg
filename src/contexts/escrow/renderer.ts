// ============================================================================
// Render escrow context hints to actual WhatsApp messages.
//
// Patterns mirror goods/renderer.ts — text reply first, then any interactive
// follow-ups (transaction card, dispute card, CTA button).
// ============================================================================

import {
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
  sendWhatsAppList,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";
import {
  type EscrowRenderHint,
  ghs,
} from "./tool-executor";
import type { EscrowTransaction } from "./backend-client";

const STATUS_EMOJI: Record<string, string> = {
  SUBMITTED: "📝",
  AWAITING_PAYMENT: "⏳",
  FUNDED: "💰",
  DISPATCHED: "🚚",
  DELIVERED: "📦",
  RELEASED: "✅",
  REFUNDED: "💸",
  DISPUTED: "⚠️",
  CANCELLED: "❌",
  RESOLVED: "🤝",
  OPEN: "⚠️",
};

const emoji = (s: string) => STATUS_EMOJI[(s || "").toUpperCase()] ?? "•";

function formatTxnSummary(t: EscrowTransaction): string {
  const lines = [
    `📑 ${t.short_id}`,
    `${emoji(t.status)} Status: ${t.status}`,
    `Item: ${t.product_name}`,
    `Total: ${ghs(t.grand_total)}`,
  ];
  if (t.seller_name) lines.push(`Seller: ${t.seller_name}`);
  if (t.delivery_address) lines.push(`Delivery: ${t.delivery_address.slice(0, 60)}`);
  return lines.join("\n");
}

async function renderTransactionCard(
  to: string,
  t: EscrowTransaction,
  role: "buyer" | "seller"
) {
  const body = `${formatTxnSummary(t)}\n\nYour role: ${role}`;
  // Two natural follow-ups depending on status:
  const buttons: { id: string; title: string }[] = [];
  if (t.status === "DISPUTED" || t.status === "FUNDED" || t.status === "DELIVERED") {
    buttons.push({ id: `escrow:open_dispute:${t.short_id}`, title: "Open dispute" });
  }
  buttons.push({ id: `escrow:view_full:${t.short_id}`, title: "Open in SBBS" });

  await sendWhatsAppButtons({ to, body, buttons }).catch((err) =>
    console.error("[escrow-render] tx card buttons failed:", err)
  );
}

async function renderTransactionList(
  to: string,
  txns: (EscrowTransaction & { role: "buyer" | "seller" })[]
) {
  if (txns.length === 0) {
    await sendWhatsAppMessage(
      to,
      "No SBBS transactions on this number yet. Tap below to start one if you'd like:"
    );
    return;
  }

  const rows = txns.slice(0, 10).map((t) => ({
    id: `escrow:open_txn:${t.short_id}`,
    title: t.short_id,
    description:
      `${emoji(t.status)} ${t.status} • ${ghs(t.grand_total)} • as ${t.role}`.slice(0, 72),
  }));

  await sendWhatsAppList({
    to,
    body: `Your last ${rows.length} SBBS transaction${rows.length === 1 ? "" : "s"}:`,
    buttonText: "Pick one",
    sections: [{ title: "Recent transactions", rows }],
  }).catch((err) => console.error("[escrow-render] list failed:", err));
}

async function renderDisputeCard(
  to: string,
  dispute: { id: string; status: string; reason: string; resolution: string | null; created_at: string },
  txn: { short_id: string; status: string }
) {
  const body =
    `⚠️ Dispute on ${txn.short_id}\n\n` +
    `${emoji(dispute.status)} Status: ${dispute.status}\n` +
    `Reason: ${dispute.reason.slice(0, 200)}\n` +
    (dispute.resolution
      ? `Resolution: ${dispute.resolution.slice(0, 200)}\n`
      : `A reviewer will be in touch.\n`) +
    `Opened: ${new Date(dispute.created_at).toLocaleDateString("en-GH")}`;

  await sendWhatsAppButtons({
    to,
    body,
    buttons: [
      { id: `escrow:upload_evidence:${txn.short_id}`, title: "Add evidence" },
      { id: `escrow:view_full:${txn.short_id}`, title: "Open in SBBS" },
    ],
  }).catch((err) => console.error("[escrow-render] dispute card failed:", err));
}

async function renderSbbsCta(
  to: string,
  url: string,
  header: string,
  body: string
) {
  await sendWhatsAppCtaUrl({
    to,
    header: header.slice(0, 60),
    body: body.slice(0, 1024),
    buttonText: "Open SBBS",
    url,
    footer: "Sell-Safe Buy-Safe",
  }).catch((err) => console.error("[escrow-render] cta failed:", err));
}

export async function renderEscrowHint(
  to: string,
  hint: EscrowRenderHint
): Promise<void> {
  switch (hint.kind) {
    case "transaction_card":
      return renderTransactionCard(to, hint.transaction, hint.role);
    case "transaction_list":
      return renderTransactionList(to, hint.transactions);
    case "dispute_card":
      return renderDisputeCard(to, hint.dispute, hint.transaction);
    case "sbbs_cta":
      return renderSbbsCta(to, hint.url, hint.header, hint.body);
    case "none":
    default:
      return;
  }
}

export async function renderEscrowHints(
  to: string,
  hints: EscrowRenderHint[]
): Promise<void> {
  // Dedupe by kind+key (e.g. don't send the same transaction card twice)
  const seen = new Set<string>();
  for (const h of hints) {
    if (h.kind === "none") continue;
    const key =
      h.kind === "transaction_card"
        ? `tx:${h.transaction.short_id}`
        : h.kind === "dispute_card"
          ? `dispute:${h.transaction.short_id}`
          : h.kind === "sbbs_cta"
            ? `cta:${h.url}`
            : h.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    await renderEscrowHint(to, h);
  }
}
