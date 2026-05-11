// ============================================================================
// Knowledge module — single import for all GSG service knowledge.
//
// Each context's system prompt composes from here so the AI gets the SAME
// canonical facts (fees, hours, social handles, flow) no matter which agent is
// answering. When something on a real website changes, update the relevant
// file in this folder and every agent gets it instantly.
//
// Usage:
//   import { buildBrandKnowledgeBlock, buildEscrowKnowledgeBlock } from "@/knowledge";
// ============================================================================

import {
  COMPANY,
  COMPANY_PILLARS,
  renderCompanyContacts,
  renderCompanyIdentity,
} from "./company";
import {
  PERSONAL_SHOPPER_KNOWLEDGE,
  PERSONAL_SHOPPER_SHORT,
} from "./personal-shopper";
import { GOODS_KNOWLEDGE, GOODS_SHORT } from "./goods";
import {
  SBBS_KNOWLEDGE,
  SBBS_SHORT,
  SBBS_FEES,
  SBBS_CONTACTS,
} from "./sbbs";
import {
  COURIER_KNOWLEDGE,
  STREET_CUISINE_KNOWLEDGE,
  AFFILIATES_KNOWLEDGE,
  AID_KNOWLEDGE,
} from "./other-units";

// Re-exports
export {
  COMPANY,
  COMPANY_PILLARS,
  renderCompanyContacts,
  renderCompanyIdentity,
  PERSONAL_SHOPPER_KNOWLEDGE,
  PERSONAL_SHOPPER_SHORT,
  GOODS_KNOWLEDGE,
  GOODS_SHORT,
  SBBS_KNOWLEDGE,
  SBBS_SHORT,
  SBBS_FEES,
  SBBS_CONTACTS,
  COURIER_KNOWLEDGE,
  STREET_CUISINE_KNOWLEDGE,
  AFFILIATES_KNOWLEDGE,
  AID_KNOWLEDGE,
};

/**
 * Composed knowledge block for the BRAND concierge — it has to know a bit
 * about every service so it can answer customer questions before routing.
 */
export function buildBrandKnowledgeBlock(): string {
  return `${renderCompanyIdentity()}

${renderCompanyContacts()}

# WHAT EACH GSG SERVICE ACTUALLY DOES — read every section so you can answer real questions, not just send links

${PERSONAL_SHOPPER_KNOWLEDGE}

${GOODS_KNOWLEDGE}

${SBBS_KNOWLEDGE}

${COURIER_KNOWLEDGE}

${STREET_CUISINE_KNOWLEDGE}

${AFFILIATES_KNOWLEDGE}

${AID_KNOWLEDGE}

# DEFAULT FAQ ANSWERS (you can use these verbatim when applicable)
- "What services does GSG offer?" → list the seven (Convenience Goods, Personal Shopper, SBBS, StreetCuisine, Courier, Affiliates, GSG-AID) in one sentence; then ask which one they're after.
- "Where are you located?" → HQ in ${COMPANY.hqCity}, with logistics hubs in ${COMPANY.expansionHubs.join(" and ")}; we ship across Ghana.
- "What's your phone number?" → "${COMPANY.phones.whatsappPrimary} (where you're chatting with us now) or ${COMPANY.phones.callLine}; extended-hours line is ${COMPANY.phones.extendedSupport}." Pick the most relevant one — don't dump the whole list unless asked.
- "Do you have Instagram / Twitter / TikTok?" → YES: Instagram ${COMPANY.social.instagram}, X (Twitter) ${COMPANY.social.twitter}, TikTok ${COMPANY.social.tiktok}. Also Telegram ${COMPANY.social.telegram} and our WhatsApp Channel ${COMPANY.social.whatsappChannel}.
- "Do you have Facebook / YouTube / Snapchat?" → Be honest — we're not on those right now. Point them to the channels we DO have (WhatsApp, Telegram, Instagram, TikTok, X, email).
- "What are your hours?" → ${COMPANY.hours.regular}; ${COMPANY.hours.extended}.
- "Are you live 24/7?" → Phone support follows the schedule above; WhatsApp itself is monitored throughout the day and we usually respond within minutes.`;
}

/**
 * Composed knowledge block for the ESCROW (SBBS) agent.
 */
export function buildEscrowKnowledgeBlock(): string {
  return `${SBBS_KNOWLEDGE}`;
}

/**
 * Composed knowledge block for the GOODS agent — small adjacent-services
 * awareness so it knows when to escalate to Personal Shopper or SBBS.
 */
export function buildGoodsAdjacencyBlock(): string {
  return `# OTHER GSG SERVICES YOU CAN HAND OFF TO

You're the Convenience Goods agent — you carry our in-stock catalogue and check out via Mobile Money. But sometimes a customer wants something we don't stock, or a use-case that's better served by a sister service. KNOW these so you can route gracefully:

- MY PERSONAL SHOPPER (https://shopper.gsgbrands.com.gh) — a real GSG shopper sources items from local markets, shops, and specialty stores on the customer's behalf. Source-price guaranteed (no mark-up on goods); 5% commission or LESS on the subtotal; distance-based delivery fee. The customer creates a list (item + quantity + their estimated price), we confirm totals, they pay online via Mobile Money or card, then we shop and deliver. Same-day in Accra for lists placed before 11am. Use this when:
  - Customer asks for fresh meat, fresh fish, fresh produce, ingredients-by-recipe ("ingredients for goat soup", "everything for jollof for 6"), market-only items, building materials (cement / blocks / tools), specialty / imported goods we don't stock.
  - Customer needs an URGENT pharmacy run (medicines, first-aid) — we can source on a valid prescription.
  - Customer wants someone else to do the running around at fair, transparent pricing.
  → DON'T just say "we don't have X". Say: "We don't stock fresh goat meat in our online shop, but our Personal Shopper team can source it for you at the market price plus a small commission and deliver it. Want me to set that up? https://shopper.gsgbrands.com.gh"

- SELL-SAFE BUY-SAFE / SBBS (https://sellbuysafe.gsgbrands.com.gh) — escrow for buying off-platform (Instagram seller, WhatsApp vendor, marketplace). Use this when a customer:
  - Wants to buy a high-value item (iPhone, laptop, jewellery) from someone they don't fully trust.
  - Mentions a specific transaction ID like SBS-XXXXXXXX.
  - Says "I was scammed" or "I'm worried about getting scammed".
  - Asks to "open a dispute" / "release my payment" / "the seller didn't deliver".

- STREETCUISINE / COURIER / AFFILIATES — sister services. If the customer asks about food, parcel delivery or earning commissions, mention the relevant link.

When you escalate, BE SPECIFIC. Say which sister service handles it and why, and give them the link. Don't be vague.

# HONESTY RULES
- We are a CONVENIENCE GOODS store: groceries, household, personal care, basic mobile accessories, stationery, basic medicines.
- We are NOT an electronics retailer — phones, laptops, TVs are NOT in our standard catalogue (search the DB to verify, but be honest if it's not there).
- We are NOT a fresh-food market — fresh meat, fresh fish, fresh produce live with Personal Shopper.
- We are NOT a restaurant or cooked-food service — that's StreetCuisine.
- If a customer asks for an iPhone or a fresh fish, the right move is: search briefly to be sure, then HONESTLY redirect to the right sister service.`;
}
