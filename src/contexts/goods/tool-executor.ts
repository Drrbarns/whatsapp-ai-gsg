// ============================================================================
// Tool dispatcher — routes LLM tool_calls to actual implementations.
//
// Returns a strongly-typed result envelope. The webhook then:
//   1. Strings the result back to the LLM as tool message content
//   2. Reads any "render hints" to decide whether to send extra
//      WhatsApp Interactive Messages (List, Buttons, etc.) after the
//      LLM's text reply.
// ============================================================================

import {
  searchProducts,
  getRecommendations,
  trackOrder,
  getProductVariants,
  type GSGProduct,
  type GSGOrder,
  type GSGVariant,
} from "./tools";
import {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  type Cart,
} from "./cart";
import { startCheckout, type CheckoutSuccess, type CheckoutFailure } from "./orders";
import { checkCoupon } from "./tools";
import { getStoreInfo } from "./store-info";
import type { GSGIdentity } from "./identity";

// ── Render hints — guide the webhook on follow-up WA messages ──────────────
export type RenderHint =
  | { kind: "products"; products: GSGProduct[]; intro?: string }
  | { kind: "variants"; product: GSGProduct; variants: GSGVariant[] }
  | { kind: "cart"; cart: Cart }
  | { kind: "checkout_success"; result: CheckoutSuccess }
  | { kind: "order_card"; order: GSGOrder }
  | { kind: "none" };

export type ToolResult = {
  /** Stringified payload sent back to the LLM. Keep it tight. */
  llm: string;
  /** Optional follow-up WhatsApp message hint. */
  hint: RenderHint;
};

export type ToolContext = {
  identity: GSGIdentity;
  phone: string;
};

function ok(llm: unknown, hint: RenderHint = { kind: "none" }): ToolResult {
  return { llm: typeof llm === "string" ? llm : JSON.stringify(llm), hint };
}

export async function executeToolCall(
  ctx: ToolContext,
  name: string,
  rawArgs: string
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return ok({ error: "invalid_json_arguments" });
  }

  console.log(`[gsg-tool] ${name}`, JSON.stringify(args).slice(0, 200));

  try {
    switch (name) {
      // ─────────────────────────────────────── Reads
      case "search_products": {
        const products = await searchProducts(
          String(args.query || ""),
          Number(args.limit ?? 5)
        );
        console.log(
          `[gsg-tool] search_products("${args.query}") → ${products.length} result(s)`
        );
        return ok(
          {
            count: products.length,
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              quantity: p.quantity,
              inStock: p.inStock,
              brand: p.brand,
              hasVariants: p.hasVariants,
            })),
            // Hint to LLM: if 0 results, try a broader/synonym search
            ...(products.length === 0
              ? {
                  hint: "ZERO results — try ONE broader variation of the query (e.g. drop adjectives, use synonyms) before telling the customer we don't have it.",
                }
              : {}),
          },
          { kind: "products", products, intro: undefined }
        );
      }

      case "get_recommendations": {
        const products = await getRecommendations(
          args.context ? String(args.context) : undefined
        );
        return ok(
          {
            count: products.length,
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              quantity: p.quantity,
              brand: p.brand,
            })),
          },
          { kind: "products", products }
        );
      }

      case "get_product_variants": {
        const r = await getProductVariants(String(args.product_id || ""));
        if (!r) {
          return ok({ found: false, note: "Couldn't find that product." });
        }
        if (r.variants.length === 0) {
          return ok({
            found: true,
            hasRealChoice: false,
            note: "No variants are configured. Just call add_to_cart with the product_id.",
          });
        }
        if (!r.hasRealChoice) {
          // Single 'Default' variant — just add it directly.
          return ok({
            found: true,
            hasRealChoice: false,
            only_variant_id: r.variants[0].id,
            note: "Only one default option. Call add_to_cart with this variant_id.",
          });
        }
        return ok(
          {
            found: true,
            hasRealChoice: true,
            product_name: r.product.name,
            variants: r.variants.map((v) => ({
              id: v.id,
              label: v.label,
              price: v.price,
              inStock: v.inStock,
              quantity: v.quantity,
            })),
            note: "The system is showing the customer a tappable list of these options. Reply with ONE short line like 'Pick the one you want 👇' and STOP.",
          },
          { kind: "variants", product: r.product, variants: r.variants }
        );
      }

      case "track_order": {
        // If LLM didn't pass an email, fall back to email on file (if any)
        const email = String(args.email || ctx.identity.email || "");
        const lookup = await trackOrder(String(args.order_number || ""), email);

        if (lookup.status === "missing_email") {
          return ok({
            found: false,
            reason: "missing_email",
            note: "We need the email the customer used when ordering. Ask them: 'What email did you use when placing the order?' DON'T attempt the lookup again until they reply.",
          });
        }
        if (lookup.status === "not_found") {
          return ok({
            found: false,
            reason: "not_found",
            note: "No order with that order number or tracking code exists. Ask the customer to double-check the number — order numbers look like ORD-1777586868738-964; tracking codes have prefixes like SLI-XXXXXX or GSG-XXXXXX.",
          });
        }
        if (lookup.status === "wrong_email") {
          return ok({
            found: false,
            reason: "wrong_email",
            order_exists: true,
            note: `The order ${lookup.orderNumberOnFile} exists, BUT the email provided doesn't match. Ask the customer: 'Which email did you use when you placed that order? It needs to match the one on file.' DON'T reveal the actual email on file. DON'T attempt the lookup again until they reply with a different email.`,
          });
        }

        const { order } = lookup;
        return ok(
          {
            found: true,
            order_number: order.order_number,
            status: order.status,
            payment_status: order.payment_status,
            total: order.total,
            tracking_number: order.tracking_number,
            items: order.items.map((i) => ({
              name: i.name,
              variant: i.variant,
              qty: i.quantity,
            })),
          },
          { kind: "order_card", order }
        );
      }

      // ─────────────────────────────────────── Cart
      case "view_cart": {
        const cart = await getCart(ctx.phone);
        return ok(
          {
            count: cart.items.length,
            subtotal: cart.subtotal,
            items: cart.items.map((i) => ({
              product_id: i.product_id,
              name: i.name,
              variant: i.variant_name,
              qty: i.quantity,
              price: i.price,
            })),
          },
          { kind: "cart", cart }
        );
      }

      case "add_to_cart": {
        const r = await addToCart({
          phone: ctx.phone,
          productIdOrSlug: String(args.product_id || ""),
          quantity: args.quantity ? Number(args.quantity) : 1,
          variantId: args.variant_id ? String(args.variant_id) : null,
        });
        if (!r.ok) return ok({ added: false, reason: r.reason });
        return ok(
          {
            added: true,
            item: {
              name: r.addedItem.name,
              qty: r.addedItem.quantity,
              variant: r.addedItem.variant_name,
            },
            cart_subtotal: r.cart.subtotal,
            cart_count: r.cart.items.length,
          },
          { kind: "cart", cart: r.cart }
        );
      }

      case "remove_from_cart": {
        const r = await removeFromCart({
          phone: ctx.phone,
          productIdOrName: String(args.product || ""),
        });
        return ok(
          {
            removed: !!r.removed,
            removedName: r.removed?.name ?? null,
            cart_subtotal: r.cart.subtotal,
            cart_count: r.cart.items.length,
          },
          { kind: "cart", cart: r.cart }
        );
      }

      case "clear_cart": {
        await clearCart(ctx.phone);
        return ok({ cleared: true });
      }

      // ─────────────────────────────────────── Checkout
      case "start_checkout": {
        const cart = await getCart(ctx.phone);

        // Pull profile defaults so the LLM doesn't have to re-ask known customers.
        const knownFullName = ctx.identity.displayName ?? "";
        const [knownFirst, ...knownRest] = knownFullName.split(/\s+/);
        const knownLast = knownRest.join(" ");

        const result: CheckoutSuccess | CheckoutFailure = await startCheckout({
          cart,
          shipping: {
            firstName: String(args.first_name || knownFirst || ""),
            lastName: String(args.last_name || knownLast || ""),
            email: String(args.email || ctx.identity.email || ""),
            phone: String(args.phone || ctx.identity.normalized.intl || ""),
            address1: String(args.address || ""),
            city: String(args.city || ""),
            region: String(args.region || ""),
            notes: args.notes ? String(args.notes) : undefined,
            preferredDate: args.preferred_date ? String(args.preferred_date) : undefined,
          },
          deliveryMethod:
            (String(args.delivery_method) as "doorstep" | "pickup") || "doorstep",
          userId: ctx.identity.profile?.id ?? null,
        });

        if (!result.ok) {
          return ok({ created: false, reason: result.reason });
        }
        return ok(
          {
            created: true,
            order_number: result.orderNumber,
            tracking_number: result.trackingNumber,
            total: result.total,
            payment_url: result.paymentUrl,
            // Reminder for the LLM to mention the rider quote
            note:
              "Order created. Payment is Mobile Money via the link. Rider will quote the delivery fee on arrival (not included in the total).",
          },
          { kind: "checkout_success", result }
        );
      }

      // ─────────────────────────────────────── Misc
      case "check_coupon": {
        const c = await checkCoupon(
          String(args.code || ""),
          args.cart_total != null ? Number(args.cart_total) : undefined
        );
        return ok(c);
      }

      case "get_store_info": {
        const info = getStoreInfo(String(args.topic || ""));
        return ok(info);
      }

      default:
        return ok({ error: "unknown_tool", name });
    }
  } catch (err) {
    console.error(`[gsg-tool] ${name} threw:`, err);
    return ok({ error: "tool_threw", message: (err as Error).message });
  }
}
