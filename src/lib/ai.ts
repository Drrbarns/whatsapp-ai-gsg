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
import { GSG_TOOLS } from "@/contexts/goods/llm-tools";
import { executeToolCall, type RenderHint, type ToolContext } from "@/contexts/goods/tool-executor";

// Lazy client init — instantiating at module load fails Vercel's
// "Collecting page data" step when env vars aren't yet wired.
let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _openai;
}

// Multimodal-friendly user content (text + images from WhatsApp vision)
export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type AIMessage = {
  role: "user" | "assistant";
  content: string | AIContentPart[];
};

// 2 rounds is plenty for retail chat — past that the model is almost
// always stuck. Halves the worst-case latency vs the previous 4.
const MAX_TOOL_ROUNDS = 2;
// OpenAI GPT-4o mini via OpenRouter — best price/quality for retail chat.
// Override via AI_MODEL env var if you ever want to A/B another model.
const DEFAULT_MODEL = "openai/gpt-4o-mini";

// Note: tried pinning provider to OpenAI to dodge slow Azure routing, but
// that triggered "429 Provider returned error" on every first attempt
// (OpenRouter→OpenAI tier is throttled). Letting OR pick the upstream
// avoids the 429+retry penalty.

// Cap output length. WhatsApp replies are 1–4 sentences; 1024 tokens is
// far more than we need. Also defends OpenRouter spend — without it, OR
// reserves the model's full output ceiling (e.g. 16k tokens) and 402s
// the moment your credit drops below that ceiling.
const MAX_OUTPUT_TOKENS = 1024;

// User-facing fallback when we can't get a useful reply out of the LLM.
// Always offers a human escape so customers aren't stuck.
const HUMAN_FALLBACK =
  "Sorry — having trouble on this side. Email info@gsgbrands.com.gh or call +233 24 603 3792 and a teammate will jump in. We'll be back to normal shortly.";

// Hard ceiling on a single LLM round-trip. GPT-4o-mini normally responds in
// 1.5–4s; anything past 12s is the upstream provider hanging and we'd rather
// kill it and retry with a reduced history than wait the full Vercel budget.
const LLM_TIMEOUT_MS = 12_000;

/**
 * Call the LLM once with hard timeout + auto-retry. On timeout or failure
 * (network blip, content filter trigger, malformed tool reply, 5xx), drop
 * the last few turns from history (likely poisoning the context) and try
 * once more. Returns null on total failure.
 */
async function callWithRetry(
  base: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  reduced: () => OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion | null> {
  try {
    return await openaiClient().chat.completions.create(base, {
      timeout: LLM_TIMEOUT_MS,
    });
  } catch (err) {
    console.error("[ai] LLM call failed (attempt 1):", err);
    try {
      return await openaiClient().chat.completions.create(reduced(), {
        timeout: LLM_TIMEOUT_MS,
      });
    } catch (err2) {
      console.error("[ai] LLM call failed (attempt 2):", err2);
      return null;
    }
  }
}

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
    const base: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      tools: GSG_TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    const tStart = Date.now();
    const completion = await callWithRetry(base, () => ({
      ...base,
      // Keep system prompt + last 4 turns only when retrying.
      messages: [
        messages[0],
        ...messages.slice(-4),
      ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    }));
    console.log(`[ai] tools-round ${round} llm took ${Date.now() - tStart}ms`);
    if (!completion) {
      return { reply: HUMAN_FALLBACK, hints, toolCallNames };
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

// ============================================================================
// Generic multi-round tool loop (context-agnostic).
//
// Lets each context (escrow, future personal-shopper, etc.) plug in their own
// tool definitions + executor without being entangled with goods-specific
// types. Mirrors runAIWithTools but takes the tool list and executor as args.
// ============================================================================
export type GenericToolHint<H> = H | { kind: "none" };

export async function runAIWithGenericTools<H>(opts: {
  systemPrompt: string;
  history: AIMessage[];
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  /** Returns { llm, hint } — same shape as goods tool-executor. */
  executor: (
    name: string,
    argsJson: string
  ) => Promise<{ llm: string; hint: GenericToolHint<H> }>;
  model?: string;
  temperature?: number;
  maxRounds?: number;
}): Promise<{ reply: string; hints: H[]; toolCallNames: string[] }> {
  const model = opts.model || process.env.AI_MODEL || DEFAULT_MODEL;
  const maxRounds = opts.maxRounds ?? MAX_TOOL_ROUNDS;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...(opts.history.map((m) => ({
      role: m.role,
      content: m.content as unknown as string,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
  ];

  const hints: H[] = [];
  const toolCallNames: string[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const base: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      tools: opts.tools,
      tool_choice: "auto",
      temperature: opts.temperature ?? 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    const tStart = Date.now();
    const completion = await callWithRetry(base, () => ({
      ...base,
      messages: [
        messages[0],
        ...messages.slice(-4),
      ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    }));
    console.log(`[ai] generic-tools round ${round} llm took ${Date.now() - tStart}ms`);
    if (!completion) {
      return { reply: HUMAN_FALLBACK, hints, toolCallNames };
    }

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return {
        reply: cleanReply(choice.content || "") || "Got it 👍",
        hints,
        toolCallNames,
      };
    }

    messages.push({
      role: "assistant",
      content: choice.content ?? null,
      tool_calls: toolCalls,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      const fn = tc.function;
      toolCallNames.push(fn.name);

      const result = await opts.executor(fn.name, fn.arguments || "{}");
      const hintKind = (result.hint as { kind?: string }).kind;
      if (hintKind && hintKind !== "none") hints.push(result.hint as H);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.llm,
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
    }
  }

  return {
    reply:
      "I had a hard time finishing that one — could you say it differently?",
    hints,
    toolCallNames,
  };
}

// ============================================================================
// Plain (tools-less) LLM helper.
//
// Used by contexts that don't need to call any tools — currently the brand
// context, which is purely conversational + sends CTA links via a renderer
// it controls itself (not via tool calls).
// ============================================================================
export async function runAIPlain(opts: {
  systemPrompt: string;
  history: AIMessage[];
  model?: string;
  temperature?: number;
}): Promise<{ reply: string }> {
  const model = opts.model || process.env.AI_MODEL || DEFAULT_MODEL;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...(opts.history.map((m) => ({
      role: m.role,
      content: m.content as unknown as string,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
  ];

  const base: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    temperature: opts.temperature ?? 0.5,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  const tStart = Date.now();
  const completion = await callWithRetry(base, () => ({
    ...base,
    messages: [
      messages[0],
      ...messages.slice(-4),
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  }));
  console.log(`[ai] plain llm took ${Date.now() - tStart}ms`);
  if (!completion) return { reply: HUMAN_FALLBACK };
  const raw = completion.choices[0]?.message?.content || "";
  return { reply: cleanReply(raw) || "Got it 👍" };
}
