// ============================================================================
// Personal Shopper — operational manual.
//
// Sourced DIRECTLY from the GSG Personal Shopper codebase
// (~/Documents/Websites/gsgshop/app/shopper/*) — landing page, How It Works,
// Customer Experience, FAQs, and Terms. This is the AI's lived knowledge of
// the service so it can answer real customer questions instead of dropping
// a link.
//
// Public face:  https://shopper.gsgbrands.com.gh
// Marketing:    "My Personal Shopper by GSG"
// Tagline:      "List them. We shop for you."
// Core promise: source-price guarantee + 5% commission or less.
// ============================================================================

export const PERSONAL_SHOPPER_KNOWLEDGE = `## My Personal Shopper by GSG — what it actually does

The customer creates a shopping list (item names, quantities, their own estimated prices). A real GSG personal shopper sources every item at the actual market/store price, confirms totals before purchase, sends a secure payment link, buys the items, and our courier delivers to the customer's preferred location and time. Throughout the run we update the customer over WhatsApp.

CORE PROMISE
- Source-price guarantee. We buy at the EXACT source price with NO hidden mark-ups on the goods.
- 5% commission or LESS on the item subtotal.
- Distance-based delivery fee.
- Real-time WhatsApp updates at every step.

WHO IT'S FOR
- Busy people who don't have time to shop themselves.
- Customers who need anything in the city sourced and delivered.
- Bulk buyers, restaurant owners, site engineers — anyone who wants to outsource the running around.
- People who need urgent items (medicine, first-aid, emergency supplies).
- Customers who want imported / specialty / hard-to-find items.

WHAT WE SOURCE — four broad buckets
1. Convenience Goods — everyday essentials from trusted shops and markets across the city. Examples: groceries, toiletries, drinks.
2. Specialty Goods — unique, imported, and brand-specific items hard to find elsewhere. Examples: imported brands, gifts, custom finds.
3. Urgent Runs — medicines and urgent essentials that just need to arrive fast. Examples: pharmacy items, first-aid, emergency supplies.
4. Building Materials — construction and renovation supplies sourced and delivered to site. Examples: cement & blocks, tools, finishing.

HOW IT WORKS — the canonical 4-step flow (matches /shopper/how-it-works exactly)

Step 01 — Create Your List
  Customer starts at the Shopping List page (https://shopper.gsgbrands.com.gh/shopper/shopping-list)
  — or starts the conversation here on WhatsApp and we open the form for them.
  They add: item name, quantity, and their own estimated price.
  For produce (vegetables, fruits, herbs) they can choose: Local Market, Imported, or Controlled / Certified Environment.
  More specific = better result. Helpful extras: brand, size, packaging, acceptable substitutes, deadline, delivery address & landmark.

Step 02 — We Source at Market Price
  Our team reviews the list, plans the run, and starts sourcing. We buy at the EXACT source market price — no hidden mark-ups on the goods. Our shoppers confirm quality and totals BEFORE purchasing.

Step 03 — Transparent Fees
  We charge 5% commission or LESS on the item subtotal.
  Delivery fee is calculated based on distance from the source to the customer's address.
  In rare cases (very hard-to-find items) a sourcing fee may apply — we ALWAYS communicate and agree this with the customer before purchase.

Step 04 — Pay & Schedule Delivery
  Once totals are confirmed, the customer pays securely online using Mobile Money or card (we send a payment link).
  After payment clears, the personal shopper buys the items and delivers to the customer's preferred location and time.

PRICING — the canonical fee structure
- Item subtotal: actual market source price for each item (no mark-up on goods).
- Commission: 5% or LESS on the item subtotal.
- Delivery fee: distance-based; quoted at the time the run is confirmed.
- Sourcing fee (rare): only for hard-to-find items; communicated and agreed upfront, never sprung on the customer.
- Total = items + commission + delivery (+ sourcing fee if any).

ESTIMATES vs FINAL PRICES
- The prices on the customer's list are ESTIMATES.
- Final prices are confirmed based on actual market rates on the day.
- If the actual price is significantly HIGHER than estimate, we contact the customer for approval BEFORE buying.
- If the actual price is LOWER, we refund the difference or credit it to the customer's account for next time.
- Minor differences may be settled with a top-up payment.

PAYMENT
- Mobile Money (MTN, Vodafone Cash, AirtelTigo) and Visa / Mastercard via secure payment link.
- Payment is generally completed BEFORE we begin shopping (unless otherwise agreed).
- We NEVER ask for a customer's MoMo PIN, card CVV, or password. If a customer types one, ignore it and warn them never to share it.

OUT-OF-STOCK / SUBSTITUTIONS
- If an item is out of stock, we WhatsApp the customer with the closest substitute or refund that line item.
- Nothing is bought without the customer's nod. We never quietly swap.

PRESCRIBED MEDICINE
- Yes, we source prescribed medicine.
- The customer must provide a clear picture or copy of the valid prescription (we can't process without it).

DELIVERY TIMES
- Lists placed BEFORE 11am are typically delivered SAME-DAY in Accra.
- Out-of-Accra and bulk runs are scheduled in advance.
- Bulk / multi-market runs may take 1–2 working days.
- We ADVISE customers to submit lists ahead of their preferred delivery time so we can source the freshest, best-quality items.

TRACKING
- The customer can track their request at https://shopper.gsgbrands.com.gh/shopper/track using their Request ID OR the phone number they provided when submitting the list.

COVERAGE
- Live across Accra and surrounding areas; expanding in Kumasi and Takoradi.
- Nationwide for non-perishable runs; check with the customer where they want delivery before promising.

REAL-TIME COMMUNICATION
- Customers get WhatsApp updates at every step: list reviewed → totals confirmed → payment received → shopping in progress → out for delivery.
- 24/7 WhatsApp support: +233 246 033 792 and +233 579 033 792.

EXAMPLES OF GREAT REQUESTS (use these as templates when collecting a list on WhatsApp)
- "Sunday market run — 5kg of yam, 1kg fresh tilapia (cleaned), 1kg fresh tomatoes, 2 onions, 1 ginger root. Estimated total GH₵150. Deliver to East Legon by 1pm."
- "Pharmacy run — Augmentin 625mg x 14 tabs (prescription attached), 1 box of paracetamol, 2 surgical masks. Need it in the next hour. Address: Madina, near Zongo Junction."
- "Building site — 20 bags of cement, 1 trowel set, 50m mason's line. Deliver to plot in Pokuase tomorrow morning."

EDGE CASES / WHEN TO SUGGEST A SISTER SERVICE
- Buying an iPhone / laptop / TV from someone the customer doesn't fully trust → mention Sell-Safe Buy-Safe (escrow) so the buyer's funds stay protected until they confirm receipt. Personal Shopper handles the running around; SBBS handles payment safety. The customer can use both together.
- Customer wants cooked food → that's StreetCuisine (https://cuisine.gsgbrands.com.gh), not Personal Shopper.
- Customer just needs a parcel sent across town → that's Courier (https://courier.gsgbrands.com.gh).

HONEST LIMITS
- We don't carry stock — we source on demand. We can't "instantly deliver from our warehouse" because there is no warehouse for shopper requests; everything is bought after the customer requests it.
- Perishable items are sourced same-day — we don't pre-buy and store fresh produce.
- We can't price the run upfront in chat with full accuracy — the shopper confirms totals AFTER reviewing the list, before any payment is taken.

HANDOFF FROM THIS WHATSAPP AGENT
When a customer wants Personal Shopper, the right move is:
  1. Acknowledge naturally ("Got it — that's exactly what My Personal Shopper is for.")
  2. Send the CTA card with the link.
  3. Optionally start collecting their list right here on WhatsApp so the shopper hits the ground running.
`;

// Short summary for prompts where space is tight
export const PERSONAL_SHOPPER_SHORT = `My Personal Shopper by GSG: customer creates a shopping list (item, quantity, their estimated price; for produce they can pick Local Market / Imported / Controlled Environment). We source every item at the EXACT market price (no hidden mark-ups on goods), charge 5% commission or LESS on the subtotal plus a distance-based delivery fee. Customer pays online via Mobile Money or card BEFORE we shop. We confirm out-of-stock substitutions over WhatsApp (nothing bought without their nod). Same-day delivery in Accra for lists placed before 11am. Track at /shopper/track. Start at https://shopper.gsgbrands.com.gh.`;
