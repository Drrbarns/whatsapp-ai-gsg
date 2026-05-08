// ============================================================================
// GSG Brands corporate knowledge base.
//
// Sourced from the live landing site (~/Documents/Websites/gsg/src/lib/data.ts
// and askFaqs.ts) so the WhatsApp brand persona has the same facts the website
// presents. Update this file when the landing copy changes.
//
// Used by: contexts/brand/system-prompt.ts (injected into the LLM prompt)
//          contexts/brand/handle.ts          (CTA / link rendering)
// ============================================================================

export type BusinessUnit = {
  /** Internal identifier we route on (also used for "switch to X" detection) */
  key:
    | "goods"
    | "personal_shopper"
    | "escrow"
    | "street_cuisine"
    | "courier"
    | "affiliates";
  /** Marketing name used to the customer */
  title: string;
  /** Public-facing URL the brand context can deep-link to */
  url: string;
  /** One-paragraph elevator pitch the AI can paraphrase */
  description: string;
  /** True if this business unit has its own dedicated agent context.
   *  False = the brand context only sends a CTA link (no native handoff). */
  hasAgent: boolean;
  /** Synonyms / phrases that should trigger an offer to switch into this unit. */
  intentKeywords: string[];
};

export const BUSINESS_UNITS: BusinessUnit[] = [
  {
    key: "goods",
    title: "Convenience Goods & More",
    url: "https://goods.gsgbrands.com.gh",
    description:
      "Your one-stop shop for everyday essentials — groceries, household items, personal care, mobile accessories, stationery, medicine. Fast delivery across Ghana, Mobile Money checkout, free pickup from Accra store.",
    hasAgent: true,
    intentKeywords: [
      "shop", "buy", "groceries", "rice", "oil", "noodles", "spaghetti",
      "soap", "toiletries", "household", "medicine", "stationery",
      "do you have", "i need", "i want to buy", "i'm looking for",
      "convenience", "goods", "store", "products", "price of",
      "how much is", "available", "in stock", "order something",
    ],
  },
  {
    key: "personal_shopper",
    title: "My Personal Shopper",
    url: "https://shopper.gsgbrands.com.gh",
    description:
      "We shop FOR you. From Makola, Adabraka Fish Market, Bawjiase, wholesalers and specialty stores — we source whatever you need at market price and deliver to your door.",
    hasAgent: false,
    intentKeywords: [
      "personal shopper", "shop for me", "go to market", "makola",
      "adabraka", "fish market", "bawjiase", "specialty",
      "buy from market", "market run", "wholesaler",
    ],
  },
  {
    key: "escrow",
    title: "Sell-Safe Buy-Safe",
    url: "https://sellbuysafe.gsgbrands.com.gh",
    description:
      "Trusted middleman for informal commerce. Buyer pays us, we hold the money safely, seller delivers, buyer confirms with a code, then we release payment to the seller. If anything goes wrong, open a dispute and a human at GSG arbitrates. Works for any platform — Instagram, WhatsApp, TikTok, Marketplace.",
    hasAgent: true,
    intentKeywords: [
      "escrow", "sellbuysafe", "sell-safe", "buy-safe", "sbbs", "sbs-",
      "scam", "scammed", "dispute", "refund", "release payment",
      "buyer protection", "seller protection", "release code",
      "delivery code", "transaction id", "transaction status",
      "i was scammed", "instagram seller", "whatsapp seller",
      "is this seller verified", "trust badge", "rider", "dispatch",
      "payout", "kyc", "verify my account",
    ],
  },
  {
    key: "street_cuisine",
    title: "StreetCuisine",
    url: "https://cuisine.gsgbrands.com.gh",
    description:
      "Authentic Ghanaian street food and local delicacies, fresh to your door. Verified vendors, hygiene standards enforced.",
    hasAgent: false,
    intentKeywords: [
      "street food", "cuisine", "waakye", "kelewele", "jollof",
      "banku", "kenkey", "fufu", "local food", "fresh food",
      "food delivery", "vendor",
    ],
  },
  {
    key: "courier",
    title: "Courier",
    url: "https://courier.gsgbrands.com.gh",
    description:
      "Reliable courier and delivery across Ghana — documents, packages, last-mile. Tracking included, nationwide coverage.",
    hasAgent: false,
    intentKeywords: [
      "courier", "send a package", "send a parcel", "parcel",
      "deliver this", "send documents", "pickup and delivery",
      "send something to", "drop off", "pick up and deliver",
    ],
  },
  {
    key: "affiliates",
    title: "Affiliates",
    url: "https://www.gsgbrands.com.gh/affiliates",
    description:
      "Earn commissions promoting GSG Brands services. Marketing support and partner network included.",
    hasAgent: false,
    intentKeywords: [
      "affiliate", "earn commission", "promote", "partnership",
      "referral program", "become a partner",
    ],
  },
];

/** Find the business unit a free-text message most strongly hints at. */
export function detectIntent(message: string): BusinessUnit | null {
  if (!message) return null;
  const low = message.toLowerCase();
  let best: { unit: BusinessUnit; score: number } | null = null;
  for (const unit of BUSINESS_UNITS) {
    let score = 0;
    for (const kw of unit.intentKeywords) {
      if (low.includes(kw)) score += kw.length; // longer matches = stronger
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { unit, score };
    }
  }
  return best?.unit ?? null;
}

// ─── Company facts ──────────────────────────────────────────────────────────

export const COMPANY = {
  name: "GSG Brands",
  tagline: "Convenience Goods & More",
  whatsapp: "+233 (0) 246 033 792",
  whatsappSecondary: "+233 (0) 579 033 792",
  email: "info@gsgbrands.com.gh",
  telegram: "@gsgbrandsgh",
  instagram: "@gsgbrandsgh",
  twitter: "@gsgbrandsgh",
  tiktok: "@gsgbrandsgh",
  homepage: "https://www.gsgbrands.com.gh",
  hours: "Customer support: Mon–Sat, 8am–8pm GMT. WhatsApp: 24/7.",
  coverage: "All regions of Ghana. Logistics hubs in Accra, Kumasi, Takoradi.",
} as const;

export const COMPANY_PILLARS = [
  {
    title: "Trust & Security",
    blurb: "Verified services and secure transactions for peace of mind.",
  },
  {
    title: "Speed & Efficiency",
    blurb: "Quick delivery and responsive service when you need it.",
  },
  {
    title: "Value for Money",
    blurb: "Competitive pricing and quality products that save you money.",
  },
  {
    title: "Customer Care",
    blurb: "24/7 support through WhatsApp, Telegram, and phone.",
  },
];

// ─── FAQs (mirrored from gsg/src/lib/askFaqs.ts) ────────────────────────────
// These get dropped into the system prompt so the AI can field FAQ-style
// questions immediately without needing to call any tools.

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What services does GSG Brands offer?",
    a: "GSG Brands runs a connected ecosystem: Convenience Goods & More (online grocery and household), Personal Shopper (we shop for you at any Ghanaian market), Sell-Safe Buy-Safe (escrow for social commerce), StreetCuisine (local food delivery), Courier (parcel delivery), Affiliates (partner programme), and GSG-AID (community impact arm).",
  },
  {
    q: "How can I contact customer support?",
    a: "Call +233 (0) 246 033 792 or +233 (0) 579 033 792, WhatsApp either number, Telegram @gsgbrandsgh, or email info@gsgbrands.com.gh.",
  },
  {
    q: "What are your delivery areas?",
    a: "We operate across major cities and regions in Ghana and keep expanding coverage. Tell us your exact address and we'll confirm eligibility.",
  },
  {
    q: "How do I track my order?",
    a: "Use the Tracking page on www.gsgbrands.com.gh with your Order ID or Transaction ID — or just text us the order number here and we'll look it up.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Mobile Money across all major networks (MTN MoMo, Telecel Cash, AT Money), bank transfer where applicable, and cash on delivery where a service permits.",
  },
  {
    q: "How does Personal Shopping work?",
    a: "Tell us what you need; a personal shopper confirms source pricing, substitutions if anything's out of stock, and arranges delivery. We can run anything from a single item to a full market list.",
  },
  {
    q: "Is Sell-Safe Buy-Safe trustworthy?",
    a: "Yes. SBBS sits between the buyer and seller — the buyer pays us, we hold the money, the seller delivers, the buyer confirms with a code, and only then do we release payment. Disputes go to a human reviewer.",
  },
  {
    q: "How do I join the affiliate programme?",
    a: "Visit gsgbrands.com.gh/affiliates and sign up. We'll set you up with a tracking link and marketing assets.",
  },
];
