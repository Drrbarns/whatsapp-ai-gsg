// ============================================================================
// Goods context handler — thin adapter that wraps the existing goods
// orchestration (system prompt + cart + memories + tool loop + renderer)
// in the unified per-context shape that the webhook dispatches against.
//
// The shape every context returns:
//   { reply, render, toolCallNames }
//
// Where `render` is already-bound to the phone, so the webhook can do:
//   await result.render();   // sends product cards / cart / order CTAs
// ============================================================================

import { runAIWithTools, type AIMessage } from "@/lib/ai";
import type { GSGIdentity } from "./identity";
import { buildGSGSystemPrompt } from "./system-prompt";
import { getCart } from "./cart";
import { getMemoriesForCustomer } from "./persistence";
import { renderHints } from "./renderer";

export type GoodsHandleResult = {
  reply: string;
  render: () => Promise<void>;
  toolCallNames: string[];
};

export async function handleGoods(opts: {
  phone: string;
  identity: GSGIdentity;
  history: AIMessage[];
  isFirstContact: boolean;
}): Promise<GoodsHandleResult> {
  const cart = await getCart(opts.phone);
  const memories = await getMemoriesForCustomer({
    email: opts.identity.email,
    phone: opts.identity.normalized.intl,
    customerId: opts.identity.customer?.id,
  });

  const systemPrompt = buildGSGSystemPrompt({
    identity: opts.identity,
    cart: cart.items.map((i) => ({
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      variant_name: i.variant_name,
    })),
    memories,
    isFirstContact: opts.isFirstContact,
  });

  const aiResult = await runAIWithTools({
    systemPrompt,
    history: opts.history,
    ctx: { identity: opts.identity, phone: opts.phone },
  });

  const hints = aiResult.hints;
  return {
    reply: aiResult.reply,
    render: async () => renderHints(opts.phone, hints),
    toolCallNames: aiResult.toolCallNames,
  };
}
