// ============================================================================
// Static knowledge base for GSG — used by the AI when customers ask about
// shipping, returns, payment, contact, etc. Kept in code (not DB) for v1
// because it rarely changes. Move to support_knowledge_base table later.
// ============================================================================

export const GSG_STORE_INFO = {
  shipping: `Delivery info\n\nWe deliver across Ghana — Accra is usually same-day or next-day for early orders, other regions take 2–7 business days depending on location.\n\nThe delivery fee is quoted by our rider when they get to you (it depends on your area). You can also pick up free from our store in Accra if that's easier.`,

  returns: `Returns and refunds\n\nWe accept returns within 7 days of delivery for items that are:\n• Unused and in original packaging\n• Defective or damaged on arrival\n• Significantly different from the listing\n\nJust send us your order number and the reason and we'll sort it out. Refunds usually take 5–7 business days after we get the item back.`,

  payment: `Payment\n\nWe accept Mobile Money — MTN, Vodafone Cash, AirtelTigo Money — through our secure payment link. You'll get the link right here in the chat after placing your order, and it's instant.\n\nFor very large orders we can also do bank transfer — just ask.`,

  contact: `How to reach us\n\n• WhatsApp (this chat) — 24/7\n• Phone: ${process.env.NEXT_PUBLIC_BRAND_SUPPORT_PHONE || "+233 24 000 0000"}\n• Email: ${process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL || "info@gsgbrands.com.gh"}\n• Website: ${(process.env.GSG_STOREFRONT_URL || "https://goods.gsgbrands.com.gh").replace(/^https?:\/\//, "")}\n• Instagram: @gsgbrandsgh\n\nOur human team is on Mon–Sat, 8am–8pm GMT. I'm here 24/7.`,

  about: `About ${process.env.NEXT_PUBLIC_BRAND_NAME || "GSG Convenience Goods & More"}\n\nWe're your everyday convenience store — rice, cooking oil, noodles, toiletries, household essentials and more — at honest prices. We deliver across Greater Accra and beyond.`,

  hours: `Hours\n\n• Online store: open 24/7\n• Customer support (humans): Mon–Sat, 8am–8pm GMT\n• Me (AI assistant): always here\n\nDeliveries happen Mon–Sat. Orders placed on Sunday go out Monday morning.`,
} as const;

export type GSGStoreTopic = keyof typeof GSG_STORE_INFO;

/**
 * Look up info by topic keyword. Best-effort match: returns the topic if found,
 * otherwise concatenates everything (useful for "tell me about your store").
 */
export function getStoreInfo(topic: string): string {
  const key = (topic || "").toLowerCase().replace(/[^a-z_]/g, "");
  if (!key) return Object.values(GSG_STORE_INFO).join("\n\n");

  // Match aliases too
  const aliases: Record<string, GSGStoreTopic> = {
    delivery: "shipping",
    deliveries: "shipping",
    ship: "shipping",
    refund: "returns",
    refunds: "returns",
    return: "returns",
    pay: "payment",
    payments: "payment",
    momo: "payment",
    mobilemoney: "payment",
    mtn: "payment",
    vodafone: "payment",
    phone: "contact",
    email: "contact",
    support: "contact",
    help: "contact",
    company: "about",
    store: "about",
    open: "hours",
    closed: "hours",
    schedule: "hours",
  };

  const direct = (Object.keys(GSG_STORE_INFO) as GSGStoreTopic[]).find((k) =>
    key.includes(k)
  );
  if (direct) return GSG_STORE_INFO[direct];

  const alias = Object.keys(aliases).find((a) => key.includes(a));
  if (alias) return GSG_STORE_INFO[aliases[alias]];

  return Object.values(GSG_STORE_INFO).join("\n\n");
}
