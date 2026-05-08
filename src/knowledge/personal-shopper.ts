// ============================================================================
// Personal Shopper — operational manual.
//
// Pulled directly from the GSG corporate site (data.ts business unit + the
// "How to use Personal Shopper" guide article on /news-media). This is the AI's
// lived knowledge of the service so it can answer real customer questions
// instead of just dropping a link.
// ============================================================================

export const PERSONAL_SHOPPER_KNOWLEDGE = `## Personal Shopper — what it actually does

The customer tells us what they need. A real GSG personal shopper visits markets and stores in person, confirms current pricing on each item, captures live photos for approval, negotiates the best price, and arranges courier delivery to the customer's door. It's the same outcome as going to Makola yourself — without spending the day in traffic and the heat.

WHO IT'S FOR
- People who don't have time to shop at busy markets (Makola, Adabrakah Fish Market, Bawjiase, etc.).
- People sourcing items that aren't on a store shelf — fresh meat & fish, traditional spices, fabrics, building materials, hard-to-find imports.
- People preparing meals (e.g. "ingredients for goat soup", "a full week's groceries", "everything for jollof").
- Bulk / wholesale buyers who want negotiated pricing.
- Customers who need price comparison before buying.
- Gift-givers who want recommendations curated for a specific person and budget.

WHERE OUR SHOPPERS GO
- Makola Market (Accra) — general
- Adabrakah Fish Market — fresh seafood
- Bawjiase Market — bulk produce
- Wholesale stores
- Specialty / non-traditional markets (electronics street stalls, fabric malls, building-supply yards, etc.)
- "From the minutest item to the largest" — single onion to a whole truckload.

HOW IT WORKS — step by step
1. Customer submits a request at https://shopper.gsgbrands.com.gh — or starts the conversation right here on WhatsApp and we open the form for them.
   On the form they describe each item: brand, size, colour, acceptable substitutes, quantity, deadline, budget.
2. A personal shopper is assigned. They confirm the request and head to the relevant market or store.
3. WHILE in the field, the shopper sends real-time photos of the item(s) so the customer can approve the exact pick — colour, size, freshness, whatever matters. The customer can swap or add items live.
4. Once items are confirmed, the shopper negotiates the final price (especially in traditional markets where haggling is normal). The shopper aims for the LOW end of the customer's budget without dropping quality.
5. The shopper packages everything securely. Our Courier unit picks it up and delivers it to the customer's address.
6. Payment is settled before delivery — see PAYMENT below.

WHAT TO TELL CUSTOMERS WHEN COLLECTING A REQUEST
The more specific the brief, the better the result. Ask the customer for:
- Each item's name (and brand if it matters)
- Quantity / size / packaging
- Acceptable substitutes (so the shopper doesn't come back empty if exact item is sold out)
- A budget per item or total
- A deadline ("I need it by 6pm today" / "tomorrow morning")
- Delivery address & landmark

PAYMENT
- Payment isn't fixed at the start because market prices vary. The shopper sends the live total once items are picked.
- We accept Mobile Money on every major Ghanaian network (MTN, Vodafone Cash, AirtelTigo).
- Bank transfer where applicable.
- Cash on delivery is supported on selected runs (the shopper confirms during the trip).
- We do NOT take a customer's MoMo PIN, card CVV, or any password. Ever. If a customer types one, ignore it and warn them never to share it.

PRICING / OUR FEE
- The marketplace prices the customer pays are the actual market prices the shopper agrees on the day — no hidden mark-up on the goods themselves.
- A shopper service fee + courier delivery fee are quoted on the request; these are confirmed BEFORE the shopper starts the run. If a customer asks "how much do you charge?", be honest: the fee depends on the size of the run, the markets visited, and delivery distance — the shopper sends a precise quote once they see the request. Direct them to https://shopper.gsgbrands.com.gh to start a request and get a quote.

COVERAGE
- Live across Accra and surrounding areas; expanding in Kumasi and Takoradi.
- For other regions in Ghana, ask the customer where they want delivery — we may still be able to source and ship.

TIMELINES
- Same-day if the request comes in early in the day.
- Next-day for late requests or complex multi-market runs.
- Bulk / wholesale runs can take 1–2 working days for negotiation.

REAL-TIME PHOTO APPROVAL — this is our killer feature
Customers can sit at their desk and approve each item visually — like being at the market without the crowd or heat. The shopper holds it up, takes a photo, customer says yes/no/swap, the shopper acts.

EXAMPLES OF GREAT REQUESTS
- "I need ingredients for goat soup for 6 people — onions, ginger, garlic, fresh goat meat, kpakpo shito, garden eggs, palm nuts. Budget GH₵200. Deliver to East Legon by 5pm."
- "Get me an authentic Akosombo fabric — 6 yards, kente-style, dark blue and gold preferred. Budget GH₵400."
- "Fresh tilapia — 5 medium-size, gutted and cleaned, from Adabrakah. Today, before noon."

HONEST EDGE CASES
- For very high-value items (e.g. iPhones, jewellery, gold) we strongly recommend running the purchase through Sell-Safe Buy-Safe instead, so the buyer's funds stay in escrow until they confirm receipt. Personal Shopper handles the leg work; SBBS handles the payment safety. Both can be used together.
- We don't carry stock — we source on demand. So we can't "instantly" deliver something already in our warehouse. Everything is bought after the customer requests it.
- Perishable items are sourced same-day — we don't pre-buy and store fresh produce.

HANDOFF FROM THIS WHATSAPP AGENT
When a customer wants Personal Shopper, the right move is usually to:
1. Acknowledge naturally ("Got it — that's exactly what our Personal Shopper is for.")
2. Send the CTA card with the link.
3. Optionally take their first item list right here on WhatsApp so the shopper can start without re-asking.
`;

// Short summary for prompts where space is tight
export const PERSONAL_SHOPPER_SHORT = `Personal Shopper: a real GSG shopper goes to Makola, Adabrakah Fish Market, wholesale stores or specialty stalls in person, sends LIVE photos of each item for the customer's approval, negotiates the price (haggling included), and our Courier delivers to the door. Best for fresh meat/fish, market produce, bulk runs, hard-to-find items, or "shop my whole list" jobs. Payment is Mobile Money / bank / sometimes COD. The exact fee is quoted on the request because it depends on the markets and distance — start at https://shopper.gsgbrands.com.gh.`;
