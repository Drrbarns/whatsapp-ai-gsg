// ============================================================================
// Intent router for the multi-context GSG WhatsApp agent.
//
// Decides which context (goods / escrow / brand) handles an inbound message.
//
// Decision order (cheapest signals first):
//   1. EXPLICIT COMMAND  — user said "menu" / "switch" / "shop" / "escrow" / "talk to GSG"
//   2. STRONG INTENT     — keyword match against business-unit synonyms
//   3. ACTIVE CONTEXT    — sticky: if this customer was already in a context, stay
//   4. FIRST CONTACT     — brand (welcome them and find out what they need)
//   5. AMBIGUOUS         — fall through to brand (safe default; brand can route)
//
// LLM fallback is intentionally NOT used here. The router runs on every inbound
// message and the latency + cost would compound. Regex/keyword routing is good
// enough; the brand context itself can ask clarifying questions when the
// router lands the message there.
// ============================================================================

import type { ContextKey } from "./context-state";
import { detectIntent } from "@/contexts/brand/knowledge";

export type RouteDecision = {
  context: ContextKey;
  reason:
    | "explicit_menu"
    | "explicit_switch_goods"
    | "explicit_switch_escrow"
    | "explicit_switch_brand"
    | "intent_match"
    | "sticky_active"
    | "first_contact_default"
    | "ambiguous_default";
  /** True if this is different from the previous active context */
  switched: boolean;
  /** Optional human-readable note for logging / persistence */
  note?: string;
};

const CMD_MENU = /^(menu|main menu|options|what can you do|help)$/i;
const CMD_SWITCH_GOODS = /^(shop|shopping|goods|store|buy|order|product[s]?)$/i;
const CMD_SWITCH_ESCROW = /^(escrow|sbbs|sellbuysafe|sell-?safe|buy-?safe|transaction|dispute)$/i;
const CMD_SWITCH_BRAND = /^(gsg|brand|info|about|company|main|home|back)$/i;

export function routeMessage(opts: {
  /** What the customer just typed. Already-normalized interactive postbacks count too. */
  message: string;
  /** What context they were in for the previous message (or DEFAULT if first contact) */
  activeContext: ContextKey;
  /** True if this is the very first message from this phone number ever */
  isFirstContact: boolean;
}): RouteDecision {
  const text = (opts.message ?? "").trim();
  const norm = text.toLowerCase();

  // ── 1. Explicit commands (single-word user intent) ──────────────────────
  if (CMD_MENU.test(norm)) {
    return {
      context: "brand",
      reason: "explicit_menu",
      switched: opts.activeContext !== "brand",
      note: "user asked for menu",
    };
  }
  if (CMD_SWITCH_GOODS.test(norm)) {
    return {
      context: "goods",
      reason: "explicit_switch_goods",
      switched: opts.activeContext !== "goods",
      note: "single-word shop/goods/buy",
    };
  }
  if (CMD_SWITCH_ESCROW.test(norm)) {
    return {
      context: "escrow",
      reason: "explicit_switch_escrow",
      switched: opts.activeContext !== "escrow",
      note: "single-word escrow/sbbs/transaction",
    };
  }
  if (CMD_SWITCH_BRAND.test(norm)) {
    return {
      context: "brand",
      reason: "explicit_switch_brand",
      switched: opts.activeContext !== "brand",
      note: "single-word gsg/info/back",
    };
  }

  // ── 1.5. Short conversational replies always stay in the active context.
  // Things like "yes", "yh", "ok", "no", "1", "thanks", a phone number, or
  // a quick address phrase shouldn't trigger keyword-routing — they're
  // answers to whatever the active agent just asked.
  const isVeryShort = norm.length <= 25;
  const isOneOrTwoWords = norm.split(/\s+/).filter(Boolean).length <= 2;
  if (
    !opts.isFirstContact &&
    isVeryShort &&
    isOneOrTwoWords &&
    opts.activeContext !== "brand"
  ) {
    return {
      context: opts.activeContext,
      reason: "sticky_active",
      switched: false,
      note: `short reply (${norm.length} chars) — staying in ${opts.activeContext}`,
    };
  }

  // ── 2. Strong intent match against business-unit keywords ───────────────
  // detectIntent() returns the business unit the message most strongly hints at.
  // We map only the units that have a native context:
  //   - goods unit  → goods context
  //   - escrow unit → escrow context
  //   - everything else (personal_shopper, street_cuisine, courier, affiliates)
  //     → brand context (so the AI sends a CTA link)
  const intent = detectIntent(text);
  if (intent) {
    if (intent.key === "goods") {
      return {
        context: "goods",
        reason: "intent_match",
        switched: opts.activeContext !== "goods",
        note: `intent matched "${intent.title}"`,
      };
    }
    if (intent.key === "escrow") {
      return {
        context: "escrow",
        reason: "intent_match",
        switched: opts.activeContext !== "escrow",
        note: `intent matched "${intent.title}"`,
      };
    }
    // Personal Shopper / StreetCuisine / Courier / Affiliates have no native
    // agent yet — let the brand context handle it (it'll send the right CTA).
    return {
      context: "brand",
      reason: "intent_match",
      switched: opts.activeContext !== "brand",
      note: `intent matched "${intent.title}" (no native agent → brand sends CTA)`,
    };
  }

  // ── 3. Sticky: stay in the previously-active context ────────────────────
  if (!opts.isFirstContact) {
    return {
      context: opts.activeContext,
      reason: "sticky_active",
      switched: false,
      note: "no signal — staying put",
    };
  }

  // ── 4. First contact default ────────────────────────────────────────────
  return {
    context: "brand",
    reason: "first_contact_default",
    switched: false,
    note: "first contact — brand welcomes them",
  };
}
