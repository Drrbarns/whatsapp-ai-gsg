// ============================================================================
// Sell-Safe Buy-Safe (SBBS) — operational manual.
//
// Pulled directly from the live SBBS codebase (gsgescrow):
//   - backend/src/services/fees.ts        → canonical fee schedule
//   - frontend/src/app/{buyer,seller}/*    → step-by-step flows + delivery codes
//   - frontend/src/app/{protection,seller-protection,platform-limitations}
//   - frontend/src/app/legal/{refunds,terms}
//   - frontend/src/app/{contact,calculator,reviews,tracking,hub}
//
// This is what the AI knows about the escrow service. Every fee, code length,
// timeline and email below is the ground truth.
// ============================================================================

export const SBBS_FEES = {
  // ALL percentages are PERCENT, not fractions (i.e. 0.35 means "0.35%").
  buyerPlatformPercent: 0.35,
  sellerPlatformPercent: 0.65,
  riderReleaseFlatGHS: 1.0, // only applied when delivery_fee > 0
} as const;

export const SBBS_CONTACTS = {
  whatsappPhone: "+233 24 603 3792", // SBBS-specific
  emailSupport: "support@sellbuysafe.gsgbrands.com",
  emailDisputes: "disputes@sellbuysafe.gsgbrands.com",
  emailAdmin: "admin@gsgbrands.com.gh",
  website: "https://sellbuysafe.gsgbrands.com.gh",
} as const;

export const SBBS_KNOWLEDGE = `## Sell-Safe Buy-Safe (SBBS) — what it actually is

SBBS is GSG Brands' escrow service for transactions in Ghana. The buyer pays SBBS — NOT the seller. We hold the money with a licensed payment provider (Paystack / Hubtel / Moolre / Flutterwave). The seller ships the goods. The buyer inspects them. ONLY when the buyer confirms (with a release code) — or the auto-release window (about 24 hours after delivery) elapses — do we release payment to the seller. If anything goes wrong, either party can open a dispute and a human at GSG arbitrates. We protect everybody.

WHO IT'S FOR
- Buyers and sellers transacting on Instagram, WhatsApp, Facebook, Telegram, X, or any marketplace where there's no built-in escrow.
- Anyone who's been burned by "I paid and they vanished" or "I shipped and they never paid."
- Sellers who want to prove their legitimacy with a verified SBBS badge.

THE 6 STATUSES A TRANSACTION GOES THROUGH
1. SUBMITTED — buyer has filled the form; payment link generated.
2. PAID — buyer has paid; funds are held in escrow.
3. DISPATCHED — seller has handed item to a rider.
4. IN_TRANSIT — rider is en-route.
5. DELIVERED_PENDING — rider arrived; buyer is inspecting.
6. DELIVERED_CONFIRMED → COMPLETED — buyer released the code; seller paid out.

There's also REPLACEMENT_PENDING (buyer rejected first delivery for non-food items only) and DISPUTE states.

TRANSACTION ID FORMAT
SBS-XXXXXXXX (e.g. SBS-A1B2C3D4). When a customer mentions an ID, treat anything matching that pattern as a transaction reference.

THE TWO RELEASE CODES — these matter
- Buyer delivery code: 7 characters. The buyer enters this when they confirm receipt and want the seller paid.
- Seller partial code: 4 characters. The seller has it; combined with the buyer's 7-char code, the system runs the final payout to the seller's MoMo.
NEVER ask a customer for these codes in chat. NEVER echo them back. They're entered ONLY on the SBBS website (in /buyer/step-2 and /seller/step-2). If a customer types a code, warn them never to share it with anyone — including us.

## FEES — ground truth (do not improvise)

Buyer pays = product_total + delivery_fee + rider_release_fee + buyer_platform_fee
Seller receives = product_total − seller_platform_fee
Rider receives = delivery_fee (the literal courier amount, paid out separately)

Where:
- buyer_platform_fee = 0.35% of product_total
- seller_platform_fee = 0.65% of product_total
- rider_release_fee = GHS 1.00 flat — ONLY when delivery_fee > 0; otherwise GHS 0
- product_total and delivery_fee are whatever the buyer + seller agreed to at the start.

So if a buyer purchases an item priced GHS 1,000 with a GHS 30 delivery fee:
- buyer pays: 1000 + 30 + 1 + 3.50 = GHS 1,034.50
- seller receives: 1000 − 6.50 = GHS 993.50
- rider receives: 30

If the customer asks "how much will SBBS take?" — that math is the answer. Use the calculator (https://sellbuysafe.gsgbrands.com.gh/calculator) for live preview.

PSP / payment-provider charges are SEPARATE from SBBS fees and are disclosed on the payment screen before the buyer pays.

PAYMENT METHODS the buyer can use
- MTN Mobile Money
- Telecel Cash
- AT Money (AirtelTigo)
- ATM card (Visa / Mastercard)
The buyer pays via Paystack / Hubtel / Moolre / Flutterwave (whichever PSP is configured for that transaction).

PAYOUTS to the seller
- Mobile Money to the seller's chosen number, on their chosen network.
- Triggered after the buyer releases the 7-char code OR after the auto-release window expires.
- Subject to a final superadmin approval check on every payout (compliance).

## KYC / VERIFICATION

Free. Takes 24–48 hours.

Seller KYC asks for: business name, location, optional business type, Ghana Card or TIN, social-media links. Verified sellers get a verified badge on the marketplace and unlock higher transaction limits.

Buyer KYC asks for: full name, ID type & number, address, country (default Ghana). Verified buyers unlock higher trust limits.

Statuses: APPROVED / PENDING / REJECTED / RESUBMISSION.

## BUYER FLOW (each step is a real page)

Step 1 — /buyer/step-1 (login required)
The buyer fills a form: source platform (Instagram/WhatsApp/etc.), listing link, product type (food vs non-food — this matters for replacement), addresses + map, preferred delivery date, buyer + seller names & phones, product total, delivery fee, acceptance checkbox. The fee calculator runs live. The buyer pays through the PSP.

Step 2 — /buyer/step-2 — "Confirm Delivery & Pay Rider"
For transactions in DISPATCHED / IN_TRANSIT / DELIVERED_PENDING. Buyer enters their 7-char delivery code AND the rider's MoMo number — the rider gets paid here. (Replacement requests are blocked for food items.)

Step 3 — /buyer/step-3 — "Replacement Confirmation"
For transactions in REPLACEMENT_PENDING. Buyer enters the new 7-char code to verify the replacement was received.

## SELLER FLOW

Step 1 — /seller/step-1
For transactions in PAID. Seller enters business location, rider's name + phone + telco, pickup address, and the seller's MoMo payout details (provider, name, number). On submit, the system DISPATCHES the transaction and shows the seller their 4-char partial code.

Step 2 — /seller/step-2
For transactions in DELIVERED_CONFIRMED. Seller enters BOTH the buyer's 7-char code AND their 4-char partial code → triggers payout to the seller's MoMo.

## CUSTOMER HUB — /hub

Both buyers and sellers see their dashboard at /hub. Filters by status, paginated 15 per page. Action buttons: "Pay Now" (for SUBMITTED), "Continue Dispatch" (PAID, seller side), "Continue Delivery" (DISPATCHED/IN_TRANSIT, buyer side), "Continue Payout" (seller side post-confirm).

## TRACKING — /tracking

Searchable by SBS-XXXXXXXX transaction ID OR by phone number. Returns the full status timeline.

## DISPUTES & REFUNDS — exact rules

When to raise a dispute: within 48 HOURS of delivery, via the Hub or by emailing ${SBBS_CONTACTS.emailDisputes}. Common grounds: item never arrived, item materially different from listing, item damaged, seller asked for extra payment off-platform, suspicion of fraud.

Decision timeline: GSG decides within 5 business days after receiving the dispute. Communication is via email + Hub.

Refunds: paid to the buyer's ORIGINAL payment method, processing 1–3 business days after the decision.

NON-REFUNDABLE situations:
- The buyer already released the 7-char delivery code (transaction is closed).
- The complaint comes more than 7 days after delivery.
- Perishables (food) accepted without objection at handover.

REPLACEMENT (vs refund) is allowed for NON-FOOD items only. Food items can be refunded but not replaced.

## AUTO-RELEASE — the 24-hour rule

If the buyer doesn't release the code or open a dispute within ~24 hours of delivery, funds AUTO-RELEASE to the seller. So buyers must inspect promptly. Tell hesitant buyers: "Inspect the item the same day; if anything's wrong, raise a dispute right away — once 24 hours pass, the seller is paid automatically."

## LIABILITY CAPS (legal — recite when asked)

- SBBS platform liability is capped at the platform fee paid for that transaction.
- Either party's liability is capped at the profit value of the disputed item / service.
- Disputes off-platform are discouraged and not protected.

Governing law: Ghana. Court venue: Accra.

## SECURITY RULES THE AI MUST ENFORCE

NEVER ask for or repeat:
- Mobile Money PINs
- Bank card CVV (back of card)
- Bank passwords
- Full Ghana Card numbers (we ask for them on the SBBS site, not in WhatsApp chat)
- Release codes (7-char or 4-char)

If a customer types ANY of those into the chat, ignore the value and warn them not to share it.

NEVER promise a dispute outcome — that's a human reviewer's call.
NEVER take payment in WhatsApp — payments happen on the SBBS site through a PSP.

## CONTACTS for SBBS-specific queries

- Phone / WhatsApp: ${SBBS_CONTACTS.whatsappPhone}
- General support: ${SBBS_CONTACTS.emailSupport}
- Disputes: ${SBBS_CONTACTS.emailDisputes}
- Site: ${SBBS_CONTACTS.website}

## QUICK ANSWERS for the AI to use verbatim

"How does SBBS work in one sentence?"
→ "Buyer pays us, we hold the money, seller delivers, buyer inspects and releases — only then does the seller get paid. If anything goes wrong, we arbitrate."

"Is it safe?"
→ "Yes. Funds sit with a licensed payment provider (Paystack / Hubtel / Moolre / Flutterwave) — never with the seller and never with us directly. The seller can't touch the money until you confirm with your release code, or 24 hours pass."

"How much do you charge?"
→ "0.35% from the buyer plus 0.65% from the seller, on the item price. If there's a delivery, GHS 1 flat goes to the rider release fee. PSP charges are separate and shown before you pay."

"Can I cancel after I pay?"
→ "If the seller hasn't dispatched yet — yes, raise it through the Hub or message disputes@sellbuysafe.gsgbrands.com. Once dispatched, you'd need to wait for delivery and then either accept it or open a dispute within 48 hours."

"What if the seller scams me?"
→ "That's exactly what we protect against. As long as you paid through SBBS, we still hold the money. Don't release the code if the item isn't right — open a dispute within 48 hours instead."

"What if the buyer scams me?"
→ "Once they pay us, the funds are held — they can't take them back. If they reject the item without a real reason, raise a dispute on your side; verified evidence (chat logs, photos, tracking) wins."`;

export const SBBS_SHORT = `Sell-Safe Buy-Safe (SBBS): GSG's escrow for online deals in Ghana. Buyer pays SBBS, we hold the money, seller ships, buyer confirms with a 7-char code (or auto-release in ~24h), seller gets paid via Mobile Money. Fees: 0.35% buyer + 0.65% seller + GHS 1 rider release fee (when delivery > 0). KYC free, 24–48h. Disputes within 48h of delivery, decided in 5 biz days. Site: ${SBBS_CONTACTS.website}.`;
