// ============================================================================
// Cart-state for WhatsApp customers.
//
// Backed by the wa_cart_drafts table on the WA agent's own Supabase
// (not GSG — cart-in-progress is transport-specific). Keyed by phone
// number (Meta wa_id format, e.g. "233535998837").
//
// One cart per phone. Items are stored as a JSONB array.
// ============================================================================

import { adminDb } from "@/lib/supabase";
import { gsgAdminDb } from "./db";

export type CartItem = {
  product_id: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  image: string | null;
  variant_id: string | null;
  variant_name: string | null;
};

export type Cart = {
  phone: string;
  items: CartItem[];
  gsg_email: string | null;
  gsg_full_name: string | null;
  gsg_customer_id: string | null;
  notes: string | null;
  subtotal: number;
};

function summarize(rows: CartItem[]): number {
  return rows.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
}

export async function getCart(phone: string): Promise<Cart> {
  const { data } = await adminDb()
    .from("wa_cart_drafts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (!data) {
    return {
      phone,
      items: [],
      gsg_email: null,
      gsg_full_name: null,
      gsg_customer_id: null,
      notes: null,
      subtotal: 0,
    };
  }

  const items = (data.items as CartItem[]) ?? [];
  return {
    phone: data.phone,
    items,
    gsg_email: data.gsg_email,
    gsg_full_name: data.gsg_full_name,
    gsg_customer_id: data.gsg_customer_id,
    notes: data.notes,
    subtotal: summarize(items),
  };
}

async function saveCart(phone: string, items: CartItem[], extras?: Partial<Cart>) {
  await adminDb()
    .from("wa_cart_drafts")
    .upsert({
      phone,
      items,
      gsg_email: extras?.gsg_email ?? null,
      gsg_full_name: extras?.gsg_full_name ?? null,
      gsg_customer_id: extras?.gsg_customer_id ?? null,
      notes: extras?.notes ?? null,
      updated_at: new Date().toISOString(),
    });
}

/**
 * Add a product to the cart (or increment quantity if already there).
 * Looks up the live product from GSG to validate ID, fetch price/stock/image.
 */
export async function addToCart(opts: {
  phone: string;
  productIdOrSlug: string;
  quantity?: number;
  variantId?: string | null;
}): Promise<
  | { ok: true; cart: Cart; addedItem: CartItem }
  | { ok: false; reason: string }
> {
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
  if (qty > 100) return { ok: false, reason: "Quantity must be 1–100." };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    opts.productIdOrSlug.trim()
  );

  const gsg = gsgAdminDb();
  const baseQ = gsg
    .from("products")
    .select("id, name, slug, price, quantity, status, product_images(url, position)")
    .eq("status", "active");

  const { data: product } = await (isUuid
    ? baseQ.eq("id", opts.productIdOrSlug.trim()).maybeSingle()
    : baseQ.eq("slug", opts.productIdOrSlug.trim()).maybeSingle());

  if (!product) return { ok: false, reason: "Product not found or no longer available." };
  if ((product.quantity ?? 0) < qty) {
    return {
      ok: false,
      reason: `Only ${product.quantity ?? 0} in stock — can't add ${qty}.`,
    };
  }

  let variantName: string | null = null;
  let variantPrice: number | null = null;
  let variantImage: string | null = null;

  // Detect if this product has any selectable variants (so we can reject
  // "add the product as-is" calls when the customer hasn't picked one).
  const { data: existingVariants } = await gsg
    .from("product_variants")
    .select("id, option1")
    .eq("product_id", product.id)
    .limit(1);
  const productHasVariants = (existingVariants?.length ?? 0) > 0;

  if (opts.variantId) {
    const { data: variant } = await gsg
      .from("product_variants")
      .select("id, name, price, quantity, option1, option2, option3, image_url")
      .eq("id", opts.variantId)
      .eq("product_id", product.id)
      .maybeSingle();
    if (!variant) {
      return { ok: false, reason: "That option doesn't exist for this product." };
    }
    if ((variant.quantity ?? 0) < qty) {
      return {
        ok: false,
        reason: `Only ${variant.quantity ?? 0} of that option left in stock.`,
      };
    }
    // Build label from option columns (skipping "Default" and dedup of
    // identical option1==option2 like "Black/Black")
    const opts2 = [variant.option1, variant.option2, variant.option3]
      .map((o) => (o ?? "").trim())
      .filter((o) => o && o.toLowerCase() !== "default");
    const uniq = Array.from(new Set(opts2));
    variantName =
      uniq.join(" / ") ||
      (variant.name && variant.name.toLowerCase() !== "default" ? variant.name : null);
    variantPrice = variant.price != null ? Number(variant.price) : null;
    variantImage = variant.image_url ?? null;
  } else if (productHasVariants) {
    // Customer/LLM tried to add a variant product without picking an option.
    return {
      ok: false,
      reason:
        "This product has options to choose from (size/colour/etc.). Please call get_product_variants first so the customer can pick one.",
    };
  }

  const sortedImages = (
    product.product_images as { url: string; position: number }[] | null
  )
    ?.slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const fallbackImage = sortedImages?.[0]?.url ?? null;
  const image = variantImage ?? fallbackImage;
  const price = variantPrice ?? Number(product.price);

  const cart = await getCart(opts.phone);
  const existingIdx = cart.items.findIndex(
    (i) => i.product_id === product.id && i.variant_id === (opts.variantId ?? null)
  );
  let added: CartItem;
  if (existingIdx >= 0) {
    cart.items[existingIdx].quantity += qty;
    added = cart.items[existingIdx];
  } else {
    added = {
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      price,
      quantity: qty,
      image,
      variant_id: opts.variantId ?? null,
      variant_name: variantName,
    };
    cart.items.push(added);
  }

  await saveCart(opts.phone, cart.items, cart);
  cart.subtotal = summarize(cart.items);
  return { ok: true, cart, addedItem: added };
}

export async function removeFromCart(opts: {
  phone: string;
  productIdOrName: string;
}): Promise<{ ok: true; cart: Cart; removed: CartItem | null }> {
  const cart = await getCart(opts.phone);
  const term = opts.productIdOrName.trim().toLowerCase();
  const idx = cart.items.findIndex(
    (i) =>
      i.product_id.toLowerCase() === term ||
      i.slug?.toLowerCase() === term ||
      i.name.toLowerCase().includes(term)
  );
  if (idx < 0) return { ok: true, cart, removed: null };
  const removed = cart.items.splice(idx, 1)[0];
  await saveCart(opts.phone, cart.items, cart);
  cart.subtotal = summarize(cart.items);
  return { ok: true, cart, removed };
}

export async function clearCart(phone: string): Promise<void> {
  await adminDb().from("wa_cart_drafts").delete().eq("phone", phone);
}

/** Used after order creation to remember email/name on the customer's draft for next time. */
export async function rememberCheckoutDetails(opts: {
  phone: string;
  email?: string | null;
  fullName?: string | null;
  gsgCustomerId?: string | null;
}) {
  const cart = await getCart(opts.phone);
  await saveCart(opts.phone, cart.items, {
    ...cart,
    gsg_email: opts.email ?? cart.gsg_email,
    gsg_full_name: opts.fullName ?? cart.gsg_full_name,
    gsg_customer_id: opts.gsgCustomerId ?? cart.gsg_customer_id,
  });
}
