// ============================================================================
// GSG Brands — company-level facts.
//
// These are the canonical, verified values pulled directly from the live
// gsgbrands.com.gh site (corporate landing, footer, customer experience page,
// and FAQ data). When the AI talks about phone numbers, social handles, hours
// or contact channels, this is the SOURCE OF TRUTH — never make these up,
// never guess.
// ============================================================================

export const COMPANY = {
  name: "GSG Brands",
  legalName: "GSG Brands Ghana",
  tagline: "Time & Money Saver For Value",
  pitch:
    "GSG Brands brings together Convenience Goods & More, Personal Shopping, secure marketplace, cuisine delivery, and courier services — all designed to save you time and money while delivering exceptional value.",
  homepage: "https://www.gsgbrands.com.gh",
  poweredBy: "Doctor Barns Tech",
  country: "Ghana",
  hqCity: "Accra",
  expansionHubs: ["Kumasi", "Takoradi"],

  // Phone lines — each has a specific role; never collapse into one number.
  phones: {
    // The number THIS WhatsApp agent runs on (the customer is messaging us here).
    whatsappPrimary: "+233 (0) 246 033 792",
    // Voice / call line, also reachable on WhatsApp.
    callLine: "+233 (0) 579 033 792",
    // Extended-hours support line (afternoons + later weekend slot).
    extendedSupport: "+233 (0) 571 303 716",
  },

  emails: {
    general: "info@gsgbrands.com.gh",
    sbbsAdmin: "admin@gsgbrands.com.gh",
    sbbsSupport: "support@sellbuysafe.gsgbrands.com",
    sbbsDisputes: "disputes@sellbuysafe.gsgbrands.com",
  },

  // Real, verified handles. Only list a channel here if it actually exists
  // on the live site — the agent is instructed to NEVER claim a channel
  // we haven't shipped. Facebook / Snapchat / YouTube are intentionally
  // omitted because they currently default to empty in the storefront
  // settings (see gsgshop/components/Footer.tsx).
  social: {
    whatsappChannel: "https://whatsapp.com/channel/0029VbBYwi3D",
    telegram: "https://t.me/gsgbrandsgh",
    twitter: "https://x.com/gsgbrandsgh",
    instagram: "https://www.instagram.com/gsgbrandsgh",
    instagramHandle: "@gsgbrandsgh",
    tiktok: "https://www.tiktok.com/@gsgbrandsgh",
  },

  // Support hours from /customer-experience (authoritative on site).
  hours: {
    regular:
      "Mon–Fri 5:00am – 2:00pm; Sat & holidays 5:00am – 9:00am (call +233 (0) 246 033 792 or +233 (0) 579 033 792)",
    extended:
      "Mon–Fri 2:01pm – 6:00pm; Sat & holidays 9:01am – 2:00pm (call +233 (0) 571 303 716)",
    summary: "Support is reachable across WhatsApp, Telegram, phone and email.",
  },

  // The six business units, with their public URLs (matches the corporate site).
  units: {
    goods: {
      name: "Convenience Goods & More",
      url: "https://goods.gsgbrands.com.gh",
      hasNativeAgent: true,
    },
    personalShopper: {
      name: "Personal Shopper",
      url: "https://shopper.gsgbrands.com.gh",
      hasNativeAgent: false,
    },
    sbbs: {
      name: "Sell-Safe Buy-Safe (SBBS)",
      url: "https://sellbuysafe.gsgbrands.com.gh",
      hasNativeAgent: true,
    },
    streetCuisine: {
      name: "StreetCuisine",
      url: "https://cuisine.gsgbrands.com.gh",
      hasNativeAgent: false,
    },
    courier: {
      name: "Courier",
      url: "https://courier.gsgbrands.com.gh",
      hasNativeAgent: false,
    },
    affiliates: {
      name: "Affiliates",
      url: "https://www.gsgbrands.com.gh/affiliates",
      hasNativeAgent: false,
    },
    aid: {
      name: "GSG-AID",
      url: "https://www.gsgbrands.com.gh/gsg-aid",
      hasNativeAgent: false,
    },
  },
} as const;

export const COMPANY_PILLARS: Array<{ name: string; line: string }> = [
  { name: "Trust & Security", line: "Verified services and secure transactions for peace of mind." },
  { name: "Speed & Efficiency", line: "Quick delivery and responsive service when you need it." },
  { name: "Value for Money", line: "Competitive pricing and quality products that save you money." },
  { name: "Customer Care", line: "Multi-channel support across WhatsApp, Telegram, phone and email." },
];

// ───────────────────────── Render helpers ─────────────────────────
// Each context's system prompt composes its identity block from these.

export function renderCompanyContacts(): string {
  return `# CONTACT CHANNELS — ONLY list these. Never claim a channel that's not in this list.
- WhatsApp (you are here): ${COMPANY.phones.whatsappPrimary}
- Call line / alt WhatsApp: ${COMPANY.phones.callLine}
- Extended-hours line: ${COMPANY.phones.extendedSupport}
- General email: ${COMPANY.emails.general}
- Telegram: ${COMPANY.social.telegram}
- WhatsApp Channel: ${COMPANY.social.whatsappChannel}
- Instagram: ${COMPANY.social.instagram} (${COMPANY.social.instagramHandle})
- TikTok: ${COMPANY.social.tiktok}
- Twitter / X: ${COMPANY.social.twitter}
- Website: ${COMPANY.homepage}

If a customer asks about Facebook, YouTube, Snapchat or any other platform NOT listed above: be honest — "We're not on Facebook right now, but you can reach us on WhatsApp, Telegram, Instagram, TikTok, X or by email." Don't make up handles.

# SUPPORT HOURS
- Regular: ${COMPANY.hours.regular}
- Extended: ${COMPANY.hours.extended}`;
}

export function renderCompanyIdentity(short = false): string {
  if (short) {
    return `${COMPANY.name} — Ghana-based ecosystem covering Convenience Goods, Personal Shopper, Sell-Safe Buy-Safe escrow, StreetCuisine, Courier and Affiliates.`;
  }
  return `${COMPANY.name} (${COMPANY.tagline}) is a ${COMPANY.country}-based ecosystem combining six services: Convenience Goods & More, Personal Shopper, Sell-Safe Buy-Safe (escrow marketplace), StreetCuisine (local food), Courier (logistics), and Affiliates. Headquartered in ${COMPANY.hqCity}, with logistics hubs in ${COMPANY.expansionHubs.join(" and ")}.`;
}
