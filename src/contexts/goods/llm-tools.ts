// ============================================================================
// OpenAI/OpenRouter function-calling tool schemas for the GSG AI agent.
//
// These define WHAT the LLM can call. The actual implementations live in:
//   - gsg-tools.ts        (DB reads)
//   - gsg-cart.ts         (cart CRUD)
//   - gsg-orders.ts       (checkout)
//   - gsg-store-info.ts   (static info)
//
// The dispatcher in gsg-tool-executor.ts routes tool_calls to those modules.
// ============================================================================

import type OpenAI from "openai";

export const GSG_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the live product catalog by name, description, or brand. Use whenever the customer asks 'do you have / show me / I want / find me' anything. Returns up to 5 products with prices and stock. ALWAYS call this before quoting any product or price.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What the customer is looking for (e.g. 'cookware set', 'perfume', 'iron')",
          },
          limit: {
            type: "number",
            description: "Max results (1–10). Default 5.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recommendations",
      description:
        "Get top-rated in-stock products. Use when the customer says 'what do you recommend / what's popular / what should I buy / give me ideas'. Optional context narrows results.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description:
              "Optional category or interest hint, e.g. 'kitchen', 'gifts', 'beauty'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_order",
      description:
        "Look up an order by order number (ORD-1777...) OR tracking code (any prefix: SLI-, GSG-, TRK-, etc). REQUIRES the customer's email for PII safety — the email MUST match the one on the order. NEVER call this without an email; if you don't have one, ASK the customer first ('What email did you use when placing the order?'). Returns either the order details, a 'missing_email' / 'wrong_email' / 'not_found' status — handle each case differently.",
      parameters: {
        type: "object",
        properties: {
          order_number: {
            type: "string",
            description:
              "The full order number (e.g. ORD-1777586868738-964) OR a tracking code with any prefix (e.g. SLI-H34XNB, GSG-AB12CD). Pass exactly what the customer gave you.",
          },
          email: {
            type: "string",
            description:
              "Email tied to the order. MUST be set. If known from the customer's profile, use it silently. Otherwise ASK FIRST and only call once you have it.",
          },
        },
        required: ["order_number", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_variants",
      description:
        "Fetch the available size/color/option choices for a product. CALL THIS BEFORE add_to_cart if the product has hasVariants=true. The system will then automatically show a tappable list of options to the customer — your reply should just be a one-line nudge like 'Pick the option you want 👇'. If the response says hasRealChoice=false, the product has no real variant choice and you can call add_to_cart directly.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description:
              "The product UUID from a previous search_products result, or the slug.",
          },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_cart",
      description:
        "Show the customer what's currently in their cart. Use when they ask 'what's in my cart / show cart / how much is my total / what did I add'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "Add a product to the customer's cart. Use the product_id from a previous search_products result. If the product has hasVariants=true, you MUST first call get_product_variants and let the customer choose — DON'T add a variant_id you didn't get from get_product_variants. Increments quantity if the same product+variant is already in cart.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description:
              "The product ID (UUID) returned from search_products, OR the slug if you only have that.",
          },
          quantity: {
            type: "number",
            description: "How many. Default 1. Max 100.",
          },
          variant_id: {
            type: "string",
            description:
              "Optional variant UUID. Only set if the customer specified a size/color and you've fetched variants.",
          },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description:
        "Remove a product from the cart. Pass the product_id, slug, or any unique part of the product name.",
      parameters: {
        type: "object",
        properties: {
          product: {
            type: "string",
            description: "Product id, slug, or partial name to identify the cart line.",
          },
        },
        required: ["product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_cart",
      description: "Empty the cart entirely. Confirm with the customer FIRST before calling this.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "start_checkout",
      description:
        "Place the order and generate a Mobile Money payment link. Call ONLY after: (1) the cart is non-empty, (2) you have ALL required fields, AND (3) you have shown the customer a summary and they have explicitly confirmed (e.g. 'yes', 'go ahead', 'place it'). Never call without explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string", description: "Valid email address" },
          phone: { type: "string", description: "Phone number (with or without +233)" },
          address: {
            type: "string",
            description: "Street/landmark/area within the city — NOT the city or region itself.",
          },
          city: {
            type: "string",
            description: "City or town only, e.g. Accra, Tema, Kumasi, Takoradi. NOT a region.",
          },
          region: {
            type: "string",
            description:
              "MUST be one of: Greater Accra, Ashanti, Western, Central, Eastern, Northern, Volta, Upper East, Upper West, Brong-Ahafo, Ahafo, Bono, Bono East, North East, Savannah, Oti, Western North.",
          },
          delivery_method: {
            type: "string",
            enum: ["doorstep", "pickup"],
            description:
              "doorstep = our rider delivers (fee paid to rider on arrival). pickup = customer collects from our store (free).",
          },
          preferred_date: {
            type: "string",
            description: "Optional preferred delivery/pickup date in YYYY-MM-DD format.",
          },
          notes: { type: "string", description: "Optional delivery notes from customer" },
        },
        required: [
          "first_name",
          "last_name",
          "email",
          "phone",
          "address",
          "city",
          "region",
          "delivery_method",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_coupon",
      description:
        "Validate a coupon code the customer has provided. Returns whether it's valid and what discount it gives.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "The coupon code (case-insensitive)" },
          cart_total: { type: "number", description: "Optional current cart subtotal in GH₵" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_info",
      description:
        "Look up store policies. Use for shipping/delivery, returns/refunds, payment methods, contact info, opening hours, or general 'about' questions.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "One of: shipping, returns, payment, contact, about, hours. Or any keyword and we'll best-match.",
          },
        },
        required: ["topic"],
      },
    },
  },
];

export type GSGToolName =
  | "search_products"
  | "get_recommendations"
  | "get_product_variants"
  | "track_order"
  | "view_cart"
  | "add_to_cart"
  | "remove_from_cart"
  | "clear_cart"
  | "start_checkout"
  | "check_coupon"
  | "get_store_info";
