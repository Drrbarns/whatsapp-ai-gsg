// ============================================================================
// Escrow context handler.
//
// Same shape as the other contexts: { reply, render, toolCallNames }.
// Plugs the escrow tool list + executor into the generic runner.
// ============================================================================

import { runAIWithGenericTools, type AIMessage } from "@/lib/ai";
import { resolveEscrowIdentity, type EscrowIdentity } from "./identity";
import { ESCROW_TOOLS } from "./llm-tools";
import {
  executeEscrowTool,
  type EscrowRenderHint,
  type EscrowToolContext,
} from "./tool-executor";
import { buildEscrowSystemPrompt } from "./system-prompt";
import { renderEscrowHints } from "./renderer";

export type EscrowHandleResult = {
  reply: string;
  render: () => Promise<void>;
  toolCallNames: string[];
};

/** True if the escrow backend isn't configured yet (env vars missing). In
 * that case we run a lighter version that only exposes the link tool. */
function escrowBackendAvailable(): boolean {
  return Boolean(process.env.ESCROW_API_BASE_URL && process.env.ESCROW_WA_API_KEY);
}

export async function handleEscrow(opts: {
  phone: string;
  history: AIMessage[];
  isFirstContact: boolean;
}): Promise<EscrowHandleResult> {
  const backendOn = escrowBackendAvailable();

  // Identity: hit SBBS only if backend is reachable; otherwise fall back to "unknown"
  const identity: EscrowIdentity = backendOn
    ? await resolveEscrowIdentity(opts.phone)
    : { isKnown: false, displayName: null, role: null, profile: null, phone: opts.phone };

  // Tools: in degraded mode, only expose send_sbbs_link (it doesn't need backend).
  const tools = backendOn
    ? ESCROW_TOOLS
    : ESCROW_TOOLS.filter(
        (t) => t.type === "function" && t.function.name === "send_sbbs_link"
      );

  const systemPrompt = buildEscrowSystemPrompt({
    identity,
    backendDegraded: !backendOn,
  });

  const ctx: EscrowToolContext = {
    identity,
    phone: opts.phone,
  };

  const result = await runAIWithGenericTools<EscrowRenderHint>({
    systemPrompt,
    history: opts.history,
    tools,
    executor: (name, argsJson) => executeEscrowTool(ctx, name, argsJson),
    temperature: 0.4, // money + disputes — be more deterministic
  });

  const hints = result.hints;
  return {
    reply: result.reply,
    render: async () => renderEscrowHints(opts.phone, hints),
    toolCallNames: result.toolCallNames,
  };
}
