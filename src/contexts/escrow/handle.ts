// ============================================================================
// Escrow context handler.
//
// Same shape as the other contexts: { reply, render, toolCallNames }.
// Plugs the escrow tool list + executor into the generic runner.
// ============================================================================

import { runAIWithGenericTools, type AIMessage } from "@/lib/ai";
import { resolveEscrowIdentity } from "./identity";
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

export async function handleEscrow(opts: {
  phone: string;
  history: AIMessage[];
  isFirstContact: boolean;
}): Promise<EscrowHandleResult> {
  // Identity is resolved against SBBS's profiles (separate from goods identity)
  const identity = await resolveEscrowIdentity(opts.phone);

  const systemPrompt = buildEscrowSystemPrompt({ identity });

  const ctx: EscrowToolContext = {
    identity,
    phone: opts.phone,
  };

  const result = await runAIWithGenericTools<EscrowRenderHint>({
    systemPrompt,
    history: opts.history,
    tools: ESCROW_TOOLS,
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
