// ============================================================================
// OpenAI/OpenRouter function-calling tool definitions for the escrow context.
//
// These describe what the LLM is allowed to call when the user is in the
// "escrow" (Sell-Safe Buy-Safe) context. The actual implementations live in
// ./tool-executor.ts.
//
// Design notes:
//   - All tools are READ-ONLY. SBBS has destructive flows (open dispute,
//     release payment, etc.) that we deliberately do NOT expose to the WhatsApp
//     agent — those happen on the escrow site itself, where ID/auth are
//     properly verified. The agent's job here is informational + guiding.
//   - Every tool implicitly scopes to the customer's phone number (passed via
//     the backend's X-WA-Phone header in backend-client.ts).
// ============================================================================

import OpenAI from "openai";

export const ESCROW_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_transaction",
      description:
        "Look up a single SBBS transaction by its short ID (format: SBS-XXXXXXXX). Returns the transaction details ONLY if the customer is the buyer or seller on it. Use this when the customer mentions a transaction ID and wants to know its status, see what stage it's at, or check the price.",
      parameters: {
        type: "object",
        properties: {
          short_id: {
            type: "string",
            description:
              "The transaction short ID, e.g. 'SBS-12345678'. Always uppercase, with dash. If the customer omits the dash or prefix, prepend SBS- before calling.",
          },
        },
        required: ["short_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_transactions",
      description:
        "List the customer's most recent SBBS transactions (where they were the buyer or seller). Use this when they ask 'what transactions do I have?' or 'show me my recent deals'.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "How many transactions to return. Default 5, max 20.",
            minimum: 1,
            maximum: 20,
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dispute_summary",
      description:
        "Return the dispute (if any) tied to a specific SBBS transaction the customer is on. Use this when the customer asks about the status of a dispute they opened, or wants to know what the resolution was.",
      parameters: {
        type: "object",
        properties: {
          short_id: {
            type: "string",
            description: "The SBBS transaction short ID (e.g. SBS-12345678).",
          },
        },
        required: ["short_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sbbs_link",
      description:
        "Send the customer a one-tap CTA button to open the Sell-Safe Buy-Safe website (or a specific page on it). Use this when they need to do something the WhatsApp agent cannot do directly: open a dispute, upload evidence, complete KYC, view full transaction details, change refund details, or start a new transaction.",
      parameters: {
        type: "object",
        properties: {
          purpose: {
            type: "string",
            enum: [
              "open_dispute",
              "upload_evidence",
              "complete_kyc",
              "view_full_transaction",
              "start_new_transaction",
              "manage_payouts",
              "home",
            ],
            description: "Which page on the SBBS site this link should land on.",
          },
          short_id: {
            type: "string",
            description:
              "Optional: a specific transaction short ID to deep-link to (e.g. for view_full_transaction).",
          },
        },
        required: ["purpose"],
      },
    },
  },
];
