// ============================================================================
// Order creation for GSG via WhatsApp.
//
// Strategy: HYBRID — we POST to GSG's own /api/checkout endpoint so GSG's
// validation, server-side price recomputation, rate limiting, and
// customer-upsert logic stay in charge. The agent NEVER trusts client-supplied
// prices, never generates order numbers, and never inserts into orders/items
// directly.
//
// After the order is created, we call /api/payment/moolre to get the
// Mobile Money payment link (Moolre is GSG's only WA payment option).
// ============================================================================

import { Cart, clearCart } from "./gsg-cart";

// GSG does NOT charge shipping at checkout — the rider quotes it on delivery.

// Valid Ghana regions — must match GSG's checkout dropdown
export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Central",
  "Eastern",
  "Northern",
  "Volta",
  "Upper East",
  "Upper West",
  "Brong-Ahafo",
  "Ahafo",
  "Bono",
  "Bono East",
  "North East",
  "Savannah",
  "Oti",
  "Western North",
] as const;

export type ShippingDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  region: string;
  postalCode?: string;
  notes?: string;
  preferredDate?: string;
};

// GSG supports only `doorstep` (rider delivery) and `pickup` (in-store).
// Payment is Mobile Money (Moolre) only — COD is NOT offered.
export type CheckoutInput = {
  cart: Cart;
  shipping: ShippingDetails;
  deliveryMethod: "doorstep" | "pickup";
  userId?: string | null;
};

export type CheckoutSuccess = {
  ok: true;
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  total: number;
  paymentUrl: string;
};

export type CheckoutFailure = { ok: false; reason: string; details?: unknown };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-]{6,}$/;

function gsgBase(): string {
  const u = process.env.GSG_STOREFRONT_URL;
  if (!u) throw new Error("GSG_STOREFRONT_URL is not set");
  return u.replace(/\/$/, "");
}

// GSG's /api/checkout generates orderNumber + trackingNumber server-side.
// We don't generate either — we just receive them in the response.

function sanitizeStr(v: string | undefined | null): string {
  if (!v) return "";
  return String(v)
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutSuccess | CheckoutFailure> {
  const { cart, shipping, deliveryMethod, userId } = input;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!cart.items?.length) return { ok: false, reason: "Your cart is empty." };
  if (cart.items.length > 50) return { ok: false, reason: "Cart has too many items (max 50)." };

  const firstName = sanitizeStr(shipping.firstName);
  const lastName = sanitizeStr(shipping.lastName);
  const email = sanitizeStr(shipping.email).toLowerCase();
  const phone = sanitizeStr(shipping.phone);
  const address1 = sanitizeStr(shipping.address1);
  const city = sanitizeStr(shipping.city);
  const region = sanitizeStr(shipping.region);

  if (!firstName) return { ok: false, reason: "We need your first name to place the order." };
  if (!lastName) return { ok: false, reason: "We need your last name to place the order." };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "That email doesn't look right — please double-check." };
  if (!PHONE_RE.test(phone)) return { ok: false, reason: "That phone number doesn't look right — please double-check." };
  if (!address1) return { ok: false, reason: "We need a delivery address." };
  if (!city) return { ok: false, reason: "We need a city or town." };
  if (!region) return { ok: false, reason: "We need a region (e.g. Greater Accra, Ashanti)." };

  // Validate region matches Ghana's official list (case-insensitive)
  const validRegion = (GHANA_REGIONS as readonly string[]).some(
    (r) => r.toLowerCase() === region.toLowerCase()
  );
  if (!validRegion) {
    return {
      ok: false,
      reason: `"${region}" isn't a valid Ghana region. Try one of: Greater Accra, Ashanti, Western, Central, Eastern, Northern, Volta, etc.`,
    };
  }

  if (!["doorstep", "pickup"].includes(deliveryMethod)) {
    return {
      ok: false,
      reason: "Delivery method must be 'doorstep' (rider delivery) or 'pickup' (collect from our store).",
    };
  }

  // ── Build payload matching GSG's /api/checkout exactly ──────────────────
  // GSG re-validates everything on the server (prices, stock, totals).
  // We only send what they expect; everything else is ignored.
  const shippingPayload = {
    firstName,
    lastName,
    email,
    phone,
    address: address1,
    city,
    region,
  };

  const items = cart.items.map((i) => ({
    id: i.product_id,
    quantity: i.quantity,
    ...(i.variant_name ? { variant: i.variant_name } : {}),
  }));

  const paymentMethod = "moolre" as const;

  // ── POST to GSG's /api/checkout (server recomputes prices, owns totals) ─
  let resp: Response;
  try {
    resp = await fetch(`${gsgBase()}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "GSG-WA-Agent/1.0" },
      body: JSON.stringify({
        items,
        shipping: shippingPayload,
        deliveryMethod,
        paymentMethod,
      }),
    });
  } catch (err) {
    console.error("[gsg-orders] checkout fetch failed:", err);
    return { ok: false, reason: "Could not reach the store right now. Please try again in a moment." };
  }

  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON response */
  }

  // GSG's checkout returns { success, message? } on failure
  const created = data as {
    success?: boolean;
    orderId?: string;
    orderNumber?: string;
    total?: number;
    trackingNumber?: string;
    message?: string;
  };

  if (!resp.ok || !created?.success) {
    const msg = created?.message || `HTTP ${resp.status}`;
    console.error("[gsg-orders] checkout failed:", resp.status, msg);
    return { ok: false, reason: `Could not create order: ${msg}`, details: data };
  }

  if (!created.orderId || !created.orderNumber || !created.trackingNumber) {
    return { ok: false, reason: "Order created but response was malformed.", details: data };
  }

  // userId is intentionally unused here — GSG resolves it server-side from
  // the Authorization header. The WA agent runs as a guest checkout.
  void userId;

  // ── Cart cleanup (success path only) ─────────────────────────────────────
  try {
    await clearCart(cart.phone);
  } catch (err) {
    console.error("[gsg-orders] failed to clear cart (non-fatal):", err);
  }

  // ── Payment link (Mobile Money via Moolre — only WA payment method) ─────
  let paymentUrl: string | null = null;
  try {
    // GSG's Moolre endpoint accepts UUID OR order_number; we pass the UUID.
    // It fetches the order itself to derive the amount — no client-supplied amount.
    const payResp = await fetch(`${gsgBase()}/api/payment/moolre`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "GSG-WA-Agent/1.0" },
      body: JSON.stringify({ orderId: created.orderId, customerEmail: email }),
    });
    const payJson = (await payResp.json()) as {
      success?: boolean;
      url?: string;
      message?: string;
      reference?: string;
    };
    paymentUrl = payJson?.success && payJson.url ? payJson.url : null;
    if (!paymentUrl) {
      console.error("[gsg-orders] Moolre returned no URL:", payJson);
    }
  } catch (err) {
    console.error("[gsg-orders] Moolre fetch failed:", err);
  }

  // Fallback: GSG doesn't have a /pay/[orderId] page yet, so we point to the
  // storefront with the order_number in a query so support can look it up.
  if (!paymentUrl) {
    paymentUrl = `${gsgBase()}/?order=${encodeURIComponent(created.orderNumber)}`;
  }

  const finalTotal = typeof created.total === "number" ? created.total : 0;

  return {
    ok: true,
    orderId: created.orderId,
    orderNumber: created.orderNumber,
    trackingNumber: created.trackingNumber,
    total: finalTotal,
    paymentUrl,
  };
}
