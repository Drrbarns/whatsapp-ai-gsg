// ============================================================================
// Function-calling tools for the brand context.
//
// Brand is the front-of-house concierge. Its job is to ROUTE customers to the
// right service, not to answer service-specific questions itself. So the only
// "tools" it has are:
//
//   1. route_to(target)              — hard handoff to the goods or escrow agent.
//                                      The brand's text reply is discarded; the
//                                      target agent answers the user's message.
//   2. send_business_unit_link(unit) — send a tappable CTA card for a unit that
//                                      doesn't have a native WhatsApp agent yet
//                                      (Personal Shopper, StreetCuisine,
//                                      Courier, Affiliates).
//   3. show_main_menu()              — send the WhatsApp List of all 6 services.
//
// No DB calls — these are purely UI/routing actions.
// ============================================================================

import type OpenAI from "openai";

export const BRAND_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "route_to",
      description:
        "Hand the conversation off to a specialist GSG agent. Call this WHENEVER the customer's intent matches one of these services — even if they only said one short word like 'pepsodent', 'rice', 'iPhone', 'shop', 'transaction', 'dispute'. Once you call this, the system DISCARDS your text reply and lets the target agent respond instead. So keep your reply blank or just '...'. NEVER explain what the target agent does — they'll do that themselves.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["goods", "escrow"],
            description:
              "Which agent answers next. 'goods' = the Convenience Goods store agent (handles ANY product question, search, cart, checkout). 'escrow' = the Sell-Safe Buy-Safe agent (handles transactions, disputes, refunds, scam protection, payment safety).",
          },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_business_unit_link",
      description:
        "Send a tappable CTA button for a GSG service that doesn't yet have its own WhatsApp agent. Use when the customer's intent matches Personal Shopper, StreetCuisine, Courier, or Affiliates. Your text reply should be ONE short sentence introducing the link.",
      parameters: {
        type: "object",
        properties: {
          unit: {
            type: "string",
            enum: ["personal_shopper", "street_cuisine", "courier", "affiliates"],
            description:
              "Which service to link. personal_shopper = Makola/market shopper service. street_cuisine = local Ghanaian food delivery (waakye, jollof, kelewele). courier = parcel/document delivery. affiliates = partner programme for earning commissions.",
          },
        },
        required: ["unit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_main_menu",
      description:
        "Send the WhatsApp List Message of all 6 GSG services. Call this when the customer says 'menu', 'show me all your services', 'what do you offer', 'options', 'help', or otherwise wants the full overview before deciding. After calling, your text reply should be a single short line (e.g. 'Here's what we offer 👇').",
      parameters: { type: "object", properties: {} },
    },
  },
];
