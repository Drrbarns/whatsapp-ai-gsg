// ============================================================================
// GSG Convenience Goods & More — operational manual.
//
// Sourced DIRECTLY from the storefront codebase
// (~/Documents/Websites/gsgshop/app/(store)/*) — shipping page, returns
// portal, contact page, FAQs, footer. This is the AI's source of truth on
// shipping options, payment, returns, pickup hubs, and contact channels.
//
// Public face:  https://goods.gsgbrands.com.gh
// Marketing:    "GSG Convenience Goods & More"
// Tagline:      "Premium Convenience Shopping in Ghana"
// ============================================================================

export const GOODS_KNOWLEDGE = `## GSG Convenience Goods & More — what we sell
A Ghana-wide online convenience store stocking everyday essentials: groceries, household items, personal care, mobile accessories, stationery, basic medicines — plus dresses, bags, shoes and electronics where available. We source locally and import quality items from trusted manufacturers, then handpick every product before it ships. Headquartered in Accra; we ship across Ghana.

# DELIVERY OPTIONS — there are exactly FOUR (matches /shipping page)

1. PICKUP
   - Window: within 72 hours of confirmation (excludes Sunday).
   - Cost: as quoted (no fee for collecting from our hubs).
   - Process: pickup location is shared at the order-confirmation stage.
   - Pickup hubs: GSG Hub — Accra Central (Mon–Sat, 8am–6pm); GSG Hub — East Legon (Mon–Sat, 9am–5pm). Exact addresses are sent at confirmation.

2. FREE DELIVERY (Tuesday & Friday only)
   - Window: orders confirmed BEFORE noon of the preceding delivery day ship the next available delivery day; orders confirmed AFTER noon ship the following delivery day.
   - Cost: FREE — minimum 5% discount on the order total is applied as a Free Delivery Discount.
   - This is our "popular" option for non-time-sensitive orders.

3. SOLE EXPRESS (daily)
   - Window: 2hr / 6hr / 12hr / 24hr / 48hr after confirmation.
   - Cost: as quoted (depends on distance and window).
   - REQUIRED for fresh produce, bakery, meat, frozen food, seafood, fish, and poultry. Never deliver these on Free Delivery — they need Sole or Joint Express.

4. JOINT EXPRESS (daily)
   - Window: 2hr / 6hr / 12hr / 24hr / 48hr after confirmation.
   - Cost: shared fee — split with a neighbour or colleague. Items remain completely private.
   - Same perishable-product rule applies.

# DELIVERY ZONES (4 zones across Ghana)
Zone 1 — Accra Metro: East Legon, Osu, Labone, Airport Residential, Dzorwulu, Cantonments, Adabraka, Tema. Free Delivery: Tue & Fri. Express: 2hr–48hr windows.
Zone 2 — Greater Accra: Madina, Legon, Haatso, Achimota, Dansoman, Spintex, Teshie, Kasoa. Free Delivery: Tue & Fri. Express: 6hr–48hr windows.
Zone 3 — Major Cities: Kumasi, Takoradi, Cape Coast, Tamale, Sunyani, Ho, Koforidua. Free Delivery: Fri only. Express: 24hr–48hr windows.
Zone 4 — Other Areas: all other locations within Ghana. Free Delivery & Express: contact us for a quote.

# CUT-OFF & PROCESSING RULES
- Orders confirmed BEFORE noon are processed same day.
- Orders confirmed AFTER noon are dispatched the next business day.
- Delivery windows EXCLUDE Sundays and public holidays.
- Processing happens Monday–Saturday.

# DELIVERY ATTEMPTS / FAILED DELIVERY
- The rider attempts delivery TWICE.
- If both attempts fail, the order is held for 5 business days at the nearest pickup hub for the customer to collect.
- Customers should keep their phone reachable during the delivery window — the rider calls before arrival.

# PAYMENT
- Mobile Money: MTN MoMo, Vodafone Cash, AirtelTigo Money.
- Cards: Visa & Mastercard credit/debit.
- All transactions go through our secure Moolre payment gateway. Industry-standard SSL, PCI-DSS compliant. We do NOT store full card details on our servers.
- We never request a customer's MoMo PIN, card CVV, or password — refuse and warn the customer if they share one.

# DELIVERY FEE — IMPORTANT BEHAVIOUR
- We DO NOT quote delivery fees in chat. The fee depends on the customer's exact location and the rider quotes it on arrival OR at confirmation.
- If a customer asks "how much is delivery?" — say honestly that the rider quotes the fee on arrival because it depends on their area, and they're welcome to choose Pickup (free), Free Delivery (Tue/Fri), Sole Express, or Joint Express.

# RETURNS & EXCHANGES
- We accept returns and exchanges. The customer can start a return from /returns by entering their order number and email.
- Items must be unused and in original packaging.
- For change-of-mind returns the customer pays return shipping; defective / wrong-item returns are FREE.
- Exchanges (different size/colour) are FREE.
- Refunds are processed to the original payment method within 5–7 business days after we receive and inspect the item.
- Some items can't be returned for hygiene reasons (opened cosmetics, intimate apparel, earrings, perishable goods) and custom/personalised items are non-returnable unless defective.
- Wrong item received? The customer should report within 48 hours with photos — we send the right item and collect the wrong one at no cost.

# ORDER TRACKING
- After confirmation the customer gets an order number by email/SMS.
- They can track at /order-tracking using their order number and email.
- Status flow: Confirmed → Processing → Out for Delivery → Delivered.
- For tracking via this WhatsApp agent: ask for the order number AND the email used at checkout, then look it up. NEVER reveal an email that's on file — if the email doesn't match, just say "that doesn't match — could you double-check?".

# PICKUP HUBS (where customers can collect)
- GSG Hub — Accra Central (exact address shared at confirmation). Hours: Mon–Sat, 8am–6pm.
- GSG Hub — East Legon (exact address shared at confirmation). Hours: Mon–Sat, 9am–5pm.

# CUSTOMER ACCOUNTS (optional)
- Guest checkout is supported.
- An account lets the customer track orders, save addresses, view purchase history, manage their wishlist, and earn loyalty points.

# SOCIAL & CONTACT (the canonical handles for this storefront)
- WhatsApp (this agent): +233 246 033 792.
- Voice / alt WhatsApp: +233 579 033 792.
- Extended-hours line: +233 571 303 716.
- Email: info@gsgbrands.com.gh.
- Telegram: t.me/gsgbrandsgh — @gsgbrandsgh.
- Instagram: instagram.com/gsgbrandsgh.
- TikTok: tiktok.com/@gsgbrandsgh.
- X (Twitter): x.com/gsgbrandsgh.
- Live-call hours: Mon–Fri 5am–2pm; Sat & holidays 5am–9am (regular). Mon–Fri 2:01pm–6pm; Sat & holidays 9:01am–2pm (extended). WhatsApp/Telegram are monitored 24/7.

# HONEST OPERATIONAL LIMITS
- We DON'T sell fresh meat, fresh fish, or fresh produce on the storefront — for those, route the customer to My Personal Shopper (https://shopper.gsgbrands.com.gh), which sources from local markets.
- We're NOT a restaurant — cooked food is StreetCuisine (https://cuisine.gsgbrands.com.gh).
- For high-value off-platform purchases (someone selling on IG/WhatsApp/Marketplace), suggest Sell-Safe Buy-Safe escrow (https://sellbuysafe.gsgbrands.com.gh) so the buyer's money is protected until they confirm receipt.
`;

// Short summary for prompts where space is tight
export const GOODS_SHORT = `GSG Convenience Goods & More: Ghana-wide online store for groceries, household, personal care, mobile accessories, stationery, basic meds (also dresses/bags/shoes/electronics). Four delivery options — Pickup (free, 72hrs from confirmation), Free Delivery (Tue/Fri, with min 5% Free-Delivery Discount), Sole Express (2hr–48hr, required for perishables), Joint Express (shared fee). Four zones; Accra Metro fastest. Cut-off: noon for same-day dispatch. Riders attempt delivery twice then hold 5 business days at pickup. Payment: Mobile Money + Visa/Mastercard via secure Moolre. Riders quote delivery fee on arrival — never quote it in chat. Track at /order-tracking with order number + email. Pickup hubs in Accra Central and East Legon.`;
