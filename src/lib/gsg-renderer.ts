// ============================================================================
// Render hints → actual WhatsApp messages.
//
// The webhook calls `renderHint(...)` after the LLM has sent its text reply.
// This is what makes the chat feel native: the AI says "Here are some
// cookware sets:" then a real WhatsApp List Message pops up below.
// ============================================================================

import {
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
  sendWhatsAppImageByUrl,
  sendWhatsAppList,
  sendWhatsAppMessage,
} from "./whatsapp";
import type { RenderHint } from "./gsg-tool-executor";
import type { GSGProduct, GSGVariant } from "./gsg-tools";
import type { Cart } from "./gsg-cart";

const fmtGHS = (n: number) => `GH₵${n.toFixed(2)}`;

// ─── Status emoji ──────────────────────────────────────────────────────────
const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  confirmed: "✅",
  processing: "🛠️",
  shipped: "🚚",
  delivered: "📦",
  cancelled: "❌",
  refunded: "💸",
  paid: "💚",
  unpaid: "⏳",
  failed: "❌",
};
const emoji = (status: string) =>
  STATUS_EMOJI[status?.toLowerCase()] ?? "•";

// ─── Renderers ─────────────────────────────────────────────────────────────

// Tightly formats a single product card body for WhatsApp.
// No markdown asterisks (WhatsApp's rendering is unreliable in interactive bodies).
function productCardBody(p: GSGProduct): string {
  const lines: string[] = [p.name];
  const priceLine = p.compare_at_price && p.compare_at_price > p.price
    ? `${fmtGHS(p.price)}  (was ${fmtGHS(p.compare_at_price)})`
    : fmtGHS(p.price);
  lines.push(priceLine);
  if (p.brand) lines.push(`by ${p.brand}`);
  if (!p.inStock) {
    lines.push("⚠️ Out of stock");
  } else if (p.quantity <= 5) {
    lines.push(`Only ${p.quantity} left in stock`);
  } else {
    lines.push("✅ In stock");
  }
  return lines.join("\n");
}

async function renderProducts(to: string, products: GSGProduct[]) {
  if (products.length === 0) {
    console.log("[render] renderProducts called with 0 products — skipping");
    return;
  }

  // Cap at 4 individual cards to avoid spamming the chat.
  // For more, send the first 4 as cards + a List Message with the rest.
  const CARD_LIMIT = 4;
  const cardProducts = products.slice(0, CARD_LIMIT);

  console.log(
    `[render] sending ${cardProducts.length} product card(s) to ${to}`
  );

  for (const p of cardProducts) {
    const body = productCardBody(p);
    // Products with variants: customer must choose option first
    const primary = p.hasVariants
      ? { id: `pickvar:${p.id}`, title: "Choose options" }
      : { id: `add:${p.id}:1`, title: "Add to cart" };
    const buttons = p.inStock
      ? [primary, { id: `more:${p.id}`, title: "More info" }]
      : [{ id: `more:${p.id}`, title: "More info" }];

    let resp: Awaited<ReturnType<typeof sendWhatsAppButtons>> | null = null;

    if (p.image) {
      try {
        resp = await sendWhatsAppButtons({
          to,
          body,
          buttons,
          imageHeaderUrl: p.image,
        });
      } catch (err) {
        console.error(`[render] image-card threw for ${p.name}:`, err);
      }

      // If Meta rejected the image-headed message, fall back to text-only.
      if (!resp || resp.error || !resp.messages?.[0]?.id) {
        console.warn(
          `[render] image-card failed for "${p.name}" (${p.image}) — falling back to text+buttons. Meta said:`,
          JSON.stringify(resp?.error || "no_response")
        );
        try {
          // Send the image separately first (so customer still sees the picture)
          await sendWhatsAppImageByUrl({
            to,
            imageUrl: p.image,
            caption: undefined,
          }).catch((e) =>
            console.error(`[render] fallback image send also failed:`, e)
          );
        } catch {
          /* swallow */
        }
        await sendWhatsAppButtons({ to, body, buttons }).catch((e) =>
          console.error(`[render] fallback text-buttons send failed:`, e)
        );
      }
    } else {
      // No image at all — text + buttons only
      await sendWhatsAppButtons({ to, body, buttons }).catch((e) =>
        console.error(`[render] no-image send failed for ${p.name}:`, e)
      );
    }
  }

  // If there were more than CARD_LIMIT, list the rest in one List Message.
  const overflow = products.slice(CARD_LIMIT);
  if (overflow.length > 0) {
    const rows = overflow.slice(0, 10).map((p) => ({
      id: `pick:${p.id}`,
      title: p.name.slice(0, 24),
      description: `${fmtGHS(p.price)}${p.inStock ? "" : " — out of stock"}`,
    }));

    try {
      await sendWhatsAppList({
        to,
        body: `${overflow.length} more matching ${overflow.length === 1 ? "item" : "items"} — tap to view:`,
        buttonText: "View more",
        sections: [{ title: "More options", rows }],
      });
    } catch (err) {
      console.error("[render] overflow list send failed:", err);
    }
  }
}

async function renderVariants(
  to: string,
  product: GSGProduct,
  variants: GSGVariant[]
) {
  if (variants.length === 0) return;

  // 1–3 options → use Reply Buttons (faster, fits the chat better)
  if (variants.length <= 3) {
    const buttons = variants.map((v) => ({
      // postback: addvar:productId:variantId:1   (qty defaults to 1)
      id: `addvar:${product.id}:${v.id}:1`,
      title: `${v.label}${v.inStock ? "" : " (out)"}`.slice(0, 20),
    }));
    await sendWhatsAppButtons({
      to,
      body: `${product.name}\nPick an option:`,
      buttons,
    }).catch((e) => console.error("[render] variants buttons failed:", e));
    return;
  }

  // 4–10 options → use a List Message
  const rows = variants.slice(0, 10).map((v) => ({
    id: `addvar:${product.id}:${v.id}:1`,
    title: v.label.slice(0, 24),
    description:
      `${fmtGHS(v.price)}` +
      (v.inStock ? "  •  In stock" : "  •  Out of stock"),
  }));

  await sendWhatsAppList({
    to,
    body: `${product.name}\n\nTap an option to add it to your cart:`,
    buttonText: "Choose option",
    sections: [{ title: "Available options", rows }],
  }).catch((e) => console.error("[render] variants list failed:", e));
}

async function renderCart(to: string, cart: Cart) {
  if (cart.items.length === 0) {
    await sendWhatsAppMessage(to, "Your cart is empty. What would you like to shop for?");
    return;
  }

  const lines = cart.items
    .map(
      (i, idx) =>
        `${idx + 1}. ${i.name}${i.variant_name ? ` (${i.variant_name})` : ""} × ${i.quantity} = ${fmtGHS(i.price * i.quantity)}`
    )
    .join("\n");
  const body = `🛒 Your cart\n\n${lines}\n\nSubtotal: ${fmtGHS(cart.subtotal)}\n\n(Our rider will quote the delivery fee on arrival.)`;

  await sendWhatsAppButtons({
    to,
    body,
    buttons: [
      { id: "checkout", title: "Checkout" },
      { id: "add_more", title: "Keep shopping" },
      { id: "clear_cart", title: "Clear cart" },
    ],
  });
}

async function renderCheckoutSuccess(
  to: string,
  result: {
    orderNumber: string;
    trackingNumber: string;
    total: number;
    paymentUrl: string;
  }
) {
  await sendWhatsAppCtaUrl({
    to,
    header: `Order ${result.orderNumber}`,
    body: `Order placed 🎉\n\nItems: ${fmtGHS(result.total)}\nDelivery fee: paid to the rider on arrival\n\nTap below to pay with Mobile Money — once we receive payment, we'll get it on the way to you.\n\nTracking: ${result.trackingNumber}`,
    buttonText: "Pay with MoMo",
    url: result.paymentUrl,
    footer: "Secure payment via Moolre",
  });
}

async function renderOrderCard(
  to: string,
  order: {
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    tracking_number: string | null;
    items: { name: string; variant: string | null; quantity: number }[];
  }
) {
  const itemLines = order.items
    .map((i) => `• ${i.name}${i.variant ? ` (${i.variant})` : ""} × ${i.quantity}`)
    .join("\n");

  const body = `📦 Order ${order.order_number}\n\n${emoji(order.status)} Status: ${order.status}\n${emoji(order.payment_status)} Payment: ${order.payment_status}\nTotal: ${fmtGHS(order.total)}\n${order.tracking_number ? `Tracking: ${order.tracking_number}\n` : ""}\n${itemLines}`;

  await sendWhatsAppMessage(to, body);
}

// ─── Public API ────────────────────────────────────────────────────────────
export async function renderHint(to: string, hint: RenderHint): Promise<void> {
  switch (hint.kind) {
    case "products":
      return renderProducts(to, hint.products);
    case "variants":
      return renderVariants(to, hint.product, hint.variants);
    case "cart":
      return renderCart(to, hint.cart);
    case "checkout_success":
      return renderCheckoutSuccess(to, hint.result);
    case "order_card":
      return renderOrderCard(to, hint.order);
    case "none":
    default:
      return;
  }
}

/** Combine multiple hints, deduplicating cart/products renders. */
export async function renderHints(to: string, hints: RenderHint[]): Promise<void> {
  // Show only the LAST cart hint, only the LAST products hint (avoid spam)
  const lastIdxByKind = new Map<string, number>();
  hints.forEach((h, i) => lastIdxByKind.set(h.kind, i));

  const seen = new Set<string>();
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i];
    if (h.kind === "none") continue;
    if (lastIdxByKind.get(h.kind) !== i) continue;
    if (seen.has(h.kind)) continue;
    seen.add(h.kind);
    await renderHint(to, h);
  }
}
