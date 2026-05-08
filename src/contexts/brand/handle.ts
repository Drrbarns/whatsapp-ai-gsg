// ============================================================================
// Brand context handler.
//
// This is the front-of-house concierge that handles:
//   - First-contact greetings ("hi", "good morning")
//   - Generic GSG questions ("what do you do?", "where are you located?")
//   - Soft routing to other contexts ("I want to shop" → tells goods to take over)
//   - Sending the main menu (List Message of all 6 business units)
//   - Sending CTA links to business units that don't have a native agent
//
// No database tools. Pure LLM + rendered CTAs.
//
// Returns the same shape every context returns:
//   { reply, render, toolCallNames }
// where `render` is a 0-arg async fn already bound to the phone, so the
// webhook just needs to await it after sending the text reply.
// ============================================================================

import { runAIPlain, type AIMessage } from "@/lib/ai";
import { buildBrandSystemPrompt } from "./system-prompt";
import {
  renderBrandHints,
  type BrandRenderHint,
} from "./renderer";
import { BUSINESS_UNITS, detectIntent } from "./knowledge";
import type { RouteDecision } from "@/lib/intent-router";

export type BrandHandleResult = {
  reply: string;
  /** Already-bound to phone — caller just awaits it after sending the text reply */
  render: () => Promise<void>;
  /** For telemetry/persistence (logged as "intent" on chat_conversations) */
  toolCallNames: string[];
};

type BrandIdentity = {
  isKnown: boolean;
  displayName: string | null;
};

export async function handleBrand(opts: {
  phone: string;
  identity: BrandIdentity;
  /** Last ~18 turns, latest user message included */
  history: AIMessage[];
  /** The just-arrived plain-text from the customer (for renderer hint detection) */
  latestUserText: string;
  /** Decision from the intent router (so the renderer knows when to also send a CTA) */
  route: RouteDecision;
  isFirstContact: boolean;
}): Promise<BrandHandleResult> {
  // Build the prompt + run a plain-chat LLM call (no tools)
  const systemPrompt = buildBrandSystemPrompt({ identity: opts.identity });
  const { reply } = await runAIPlain({
    systemPrompt,
    history: opts.history,
  });

  // Decide which renderer hints to attach AFTER the text reply.
  const hints: BrandRenderHint[] = [];

  // 1. If the user explicitly asked for the menu, always show it.
  if (opts.route.reason === "explicit_menu") {
    hints.push({ kind: "menu" });
  }

  // 2. If the user's intent matched a business unit that has NO native agent,
  //    attach a CTA so they can open that website with one tap.
  //    (For units WITH a native agent — goods/escrow — the router would have
  //    sent the message to that context instead. So if we're in brand, the
  //    intent must be one of the link-only units.)
  const intent = detectIntent(opts.latestUserText);
  if (intent && !intent.hasAgent) {
    hints.push({ kind: "cta", unit: intent });
  }

  return {
    reply,
    render: async () => renderBrandHints(opts.phone, hints),
    toolCallNames: hints.length > 0 ? [`brand:${hints.map((h) => h.kind).join("+")}`] : ["brand:chat"],
  };
}

// Re-export so the webhook can introspect what business units exist (e.g. for telemetry).
export { BUSINESS_UNITS };
