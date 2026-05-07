// ============================================================================
// AI orchestration for the GSG WhatsApp agent.
//
// Uses OpenRouter (OpenAI-compatible) with function-calling tools.
// Implements a multi-round tool loop: model decides → tools execute →
// model sees results → model speaks (or asks for another tool).
//
// Returns the final text reply + accumulated render hints from all tool
// calls, so the webhook can fire native WhatsApp messages on top.
// ============================================================================

import OpenAI from "openai";
import { GSG_TOOLS } from "./gsg-llm-tools";
import { executeToolCall, type RenderHint, type ToolContext } from "./gsg-tool-executor";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Multimodal-friendly user content (text + images from WhatsApp vision)
export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type AIMessage = {
  role: "user" | "assistant";
  content: string | AIContentPart[];
};

const MAX_TOOL_ROUNDS = 4;
const DEFAULT_MODEL = "openai/gpt-5";

// Strip leaked reasoning that some models emit.
function cleanReply(s: string): string {
  return (s || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^##\s+Step\s+\d+[:.\s].*$/gim, "")
    .replace(/^Let me think[\s\S]*?\n\n/i, "")
    .trim();
}

export type AIRunResult = {
  reply: string;
  hints: RenderHint[];
  toolCallNames: string[];
};

/**
 * Run the multi-round tool loop until the model produces a final text reply.
 *
 * @param systemPrompt the full GSG system prompt
 * @param history the conversation history WITHOUT the system message
 * @param ctx tool execution context (identity, phone)
 */
export async function runAIWithTools(opts: {
  systemPrompt: string;
  history: AIMessage[];
  ctx: ToolContext;
  model?: string;
}): Promise<AIRunResult> {
  const { systemPrompt, history, ctx } = opts;
  const model = opts.model || process.env.AI_MODEL || DEFAULT_MODEL;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(history.map((m) => ({
      role: m.role,
      content: m.content as unknown as string,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
  ];

  const hints: RenderHint[] = [];
  const toolCallNames: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model,
        messages,
        tools: GSG_TOOLS,
        tool_choice: "auto",
        temperature: 0.6,
      });
    } catch (err) {
      console.error("[ai] LLM call failed:", err);
      return {
        reply:
          "Sorry, I'm having a quick hiccup. Please try sending that again in a moment 🙏",
        hints,
        toolCallNames,
      };
    }

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // Final text reply
      const reply = cleanReply(choice.content || "");
      return {
        reply: reply || "Got it 👍",
        hints,
        toolCallNames,
      };
    }

    // Append the assistant's tool-calling turn to messages
    messages.push({
      role: "assistant",
      content: choice.content ?? null,
      tool_calls: toolCalls,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

    // Execute each tool call sequentially (simpler error handling)
    for (const tc of toolCalls) {
      // Only function tool calls are supported in v1
      if (tc.type !== "function") continue;
      const fn = tc.function;
      toolCallNames.push(fn.name);

      const result = await executeToolCall(ctx, fn.name, fn.arguments || "{}");
      if (result.hint.kind !== "none") hints.push(result.hint);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.llm,
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
    }
  }

  // Hit max rounds — synthesize a fallback
  return {
    reply:
      "I had a hard time finishing that one — could you say it differently?",
    hints,
    toolCallNames,
  };
}
