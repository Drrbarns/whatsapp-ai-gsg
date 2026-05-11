// ============================================================================
// Brand context handler.
//
// Brand is the front-of-house concierge. Its job:
//   - Welcome cold inbounds (only on first contact — no re-welcoming!)
//   - Route to the right specialist agent the moment intent is clear
//   - Send CTA links for services without native agents
//   - Field genuine brand-level FAQs (hours, services overview, contacts)
//
// On every message the brand LLM either:
//   (a) calls route_to(target) → we return { kind: "handoff", target } so the
//       webhook can re-dispatch the user's message to the target agent
//       (no brand text is sent — the target agent's reply is what the user sees)
//   (b) calls send_business_unit_link(unit) / show_main_menu() and replies with
//       a one-line intro
//   (c) just replies with text (the FAQ / general-question path)
// ============================================================================

import {
  runAIWithGenericTools,
  type AIMessage,
} from "@/lib/ai";
import { buildBrandSystemPrompt } from "./system-prompt";
import {
  renderBrandHints,
  type BrandRenderHint,
} from "./renderer";
import { BUSINESS_UNITS } from "./knowledge";
import { BRAND_TOOLS } from "./llm-tools";
import type { ContextKey } from "@/lib/context-state";

export type BrandHandleResult =
  | {
      kind: "reply";
      reply: string;
      render: () => Promise<void>;
      toolCallNames: string[];
    }
  | {
      kind: "handoff";
      target: ContextKey;
      toolCallNames: string[];
    };

type BrandIdentity = {
  isKnown: boolean;
  displayName: string | null;
};

export async function handleBrand(opts: {
  phone: string;
  identity: BrandIdentity;
  history: AIMessage[];
  isFirstContact: boolean;
}): Promise<BrandHandleResult> {
  const systemPrompt = buildBrandSystemPrompt({
    identity: opts.identity,
    isFirstContact: opts.isFirstContact,
  });

  // Tool dispatcher captures handoff intent and produces render hints.
  let handoffTarget: ContextKey | null = null;
  const collectedHints: BrandRenderHint[] = [];

  type ExecResult = {
    llm: string;
    hint: BrandRenderHint | { kind: "none" };
  };

  const executor = async (name: string, argsJson: string): Promise<ExecResult> => {
    let args: Record<string, unknown> = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      /* ignore */
    }

    if (name === "route_to") {
      const target = String(args.target || "").toLowerCase() as ContextKey;
      if (target === "goods" || target === "escrow") {
        handoffTarget = target;
        return {
          llm: JSON.stringify({
            ok: true,
            note: `The conversation is being handed off to the ${target} agent. Reply with an empty string '' — the next message the user sees will come from the ${target} agent.`,
          }),
          hint: { kind: "none" },
        };
      }
      return {
        llm: JSON.stringify({ error: "invalid_target", got: target }),
        hint: { kind: "none" },
      };
    }

    if (name === "send_business_unit_link") {
      const unitKey = String(args.unit || "").toLowerCase();
      const unit = BUSINESS_UNITS.find((u) => u.key === unitKey);
      if (!unit) {
        return {
          llm: JSON.stringify({ error: "unknown_unit", got: unitKey }),
          hint: { kind: "none" },
        };
      }
      const hint: BrandRenderHint = { kind: "cta", unit };
      collectedHints.push(hint);
      return {
        llm: JSON.stringify({
          ok: true,
          unit: unit.title,
          url: unit.url,
          note: "A tappable CTA button is being sent to the customer. Your text reply should be ONE short intro line — don't repeat the URL.",
        }),
        hint: { kind: "none" },
      };
    }

    if (name === "show_main_menu") {
      const hint: BrandRenderHint = { kind: "menu" };
      collectedHints.push(hint);
      return {
        llm: JSON.stringify({
          ok: true,
          note: "The full services menu has been queued as a List Message. Your text reply should be ONE short intro line.",
        }),
        hint: { kind: "none" },
      };
    }

    return {
      llm: JSON.stringify({ error: "unknown_tool", name }),
      hint: { kind: "none" },
    };
  };

  const result = await runAIWithGenericTools<BrandRenderHint>({
    systemPrompt,
    history: opts.history,
    tools: BRAND_TOOLS,
    executor,
    temperature: 0.3,
    maxRounds: 3,
  });

  // If brand decided to hand off, signal the webhook — its text is discarded.
  if (handoffTarget) {
    return {
      kind: "handoff",
      target: handoffTarget,
      toolCallNames: result.toolCallNames,
    };
  }

  return {
    kind: "reply",
    reply: result.reply,
    render: async () => renderBrandHints(opts.phone, collectedHints),
    toolCallNames:
      result.toolCallNames.length > 0
        ? result.toolCallNames.map((n) => `brand:${n}`)
        : ["brand:chat"],
  };
}

// Re-export so the webhook can introspect the unit list (for telemetry).
export { BUSINESS_UNITS };
