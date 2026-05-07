# WhatsApp AI Sales Agent — Technical Documentation

> Complete technical reference for the WhatsApp AI agent powering Discount Discovery Zone (DDZ). Read this end-to-end before cloning to a new client; almost every design decision here will need to be re-evaluated for the new business.

For the per-client setup playbook see [CLONING_GUIDE.md](./CLONING_GUIDE.md).
For day-2 operations see [OPERATIONS.md](./OPERATIONS.md).

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Data Architecture — Two Supabase Projects](#3-data-architecture--two-supabase-projects)
4. [Repository Structure](#4-repository-structure)
5. [Environment Variables](#5-environment-variables)
6. [Database Schemas](#6-database-schemas)
7. [The Webhook Pipeline (Step-by-Step)](#7-the-webhook-pipeline-step-by-step)
8. [The AI Brain — System Prompt + Tool Loop](#8-the-ai-brain--system-prompt--tool-loop)
9. [Tools — What the AI Can Do](#9-tools--what-the-ai-can-do)
10. [Search Engine — Including Typo Tolerance](#10-search-engine--including-typo-tolerance)
11. [Cart, Variants & Checkout Flow](#11-cart-variants--checkout-flow)
12. [Order Tracking](#12-order-tracking)
13. [WhatsApp Interactive Messages](#13-whatsapp-interactive-messages)
14. [Identity & Customer Resolution](#14-identity--customer-resolution)
15. [Persistence & Memory](#15-persistence--memory)
16. [Meta WhatsApp Cloud API — Full Setup](#16-meta-whatsapp-cloud-api--full-setup)
17. [Deployment (Vercel)](#17-deployment-vercel)
18. [Costs, Limits & Pricing](#18-costs-limits--pricing)
19. [Local Development & Testing](#19-local-development--testing)
20. [Design Decisions & Why](#20-design-decisions--why)
21. [Known Limitations & Future Work](#21-known-limitations--future-work)

---

## 1. What This Is

A production WhatsApp sales agent that:

- Receives messages from real customers via Meta's WhatsApp Cloud API.
- Answers in natural shop-attendant language (no markdown, no robotic phrasing).
- Searches the live product catalog (with typo tolerance and fuzzy matching).
- Sends rich product cards with images, prices, and tappable "Add to cart" / "Choose options" buttons.
- Manages a per-customer cart that persists across conversations.
- Walks the customer through an end-to-end checkout (address → delivery method → confirmation) and creates a real order in the storefront.
- Generates a Mobile Money payment link (Moolre) and sends it as a tappable WhatsApp button.
- Tracks orders by number/tracking code with email verification (PII safety).
- Recognizes returning customers by phone number and greets them by name.
- Remembers facts about the customer across conversations.
- Maintains an internal dashboard (Next.js) that mirrors WhatsApp Web for human takeover, monitoring, and history.

The codebase started from [`lakshit77/Whatsapp-Agent`](https://github.com/lakshit77/Whatsapp-Agent.git), then was rebuilt into a WhatsApp-Web-style dashboard, then layered with the DDZ-specific commerce stack (search, cart, checkout, identity, memory, fuzzy search, etc.).

---

## 2. High-Level Architecture

```
┌─────────────────────┐
│  WhatsApp Customer  │
└──────────┬──────────┘
           │ text / image / voice / button-tap
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Meta Cloud API  (graph.facebook.com/v22.0)                         │
└──────────┬──────────────────────────────────────────────────────────┘
           │  HTTPS POST  (webhook event)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Vercel — Next.js 16 (App Router)                                   │
│                                                                     │
│   POST /api/webhook                                                 │
│     1. Verify event                                                 │
│     2. Persist message → Agent Supabase (audit + dashboard)         │
│     3. Resolve identity from phone → DDZ Supabase (customer match)  │
│     4. Mark read + show "typing…" indicator on WhatsApp             │
│     5. Load chat history + AI memories from DDZ Supabase            │
│     6. Build dynamic system prompt                                  │
│     7. AI multi-round tool loop (OpenRouter → GPT-4o-mini)          │
│        ├─ search_products  ─┐                                       │
│        ├─ add_to_cart       ├──▶ DDZ Supabase (read products,       │
│        ├─ track_order       │     write to wa_cart_drafts on agent  │
│        ├─ start_checkout    │     Supabase)                         │
│        └─ ... (12 tools)    │                                       │
│     8. Send AI text reply via Meta Cloud API                        │
│     9. Render hints → send Interactive Messages                     │
│        (product cards, variant picker, cart, payment button)        │
│    10. Persist new turn to DDZ Supabase chat_conversations          │
│                                                                     │
│   GET/POST /api/conversations/...   (dashboard REST)                │
│                                                                     │
│   Dashboard UI  ──Supabase Realtime──▶ live updates                 │
└──────────┬──────────────────┬───────────────────────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐  ┌──────────────────────┐
│ Agent Supabase   │  │ DDZ Supabase         │
│ (Barns AI)       │  │ (production storefront)│
│ ─ conversations  │  │ ─ products           │
│ ─ messages       │  │ ─ orders             │
│ ─ wa_cart_drafts │  │ ─ customers/profiles │
│ ─ media bucket   │  │ ─ chat_conversations │
└──────────────────┘  │ ─ ai_memory          │
                      │ ─ support_kb         │
                      └──────────────────────┘
                                │
                                │ POST  (order create)
                                ▼
                      ┌──────────────────────┐
                      │ DDZ storefront       │
                      │ /api/storefront/     │
                      │   orders/create      │
                      │ /api/payment/moolre  │
                      └──────────────────────┘
```

**Key insight:** the agent runs on its OWN Supabase + Vercel project but READS / WRITES selectively to the storefront's database. This isolates the WhatsApp agent's transport-specific state (drafts, message audit, dashboard) from the storefront's business state (products, orders, customers).

---

## 3. Data Architecture — Two Supabase Projects

This is the most important concept to internalize before cloning.

### Agent Supabase ("Barns AI" — `psyaywewifjloiwnhncz`)

Owned by us. WhatsApp transport-specific state.

| Table | Purpose |
|---|---|
| `conversations` | One row per WhatsApp phone — name, mode (agent/human), unread count, last preview, typing flag |
| `messages` | Every inbound + outbound message, with media URLs from Storage |
| `wa_cart_drafts` | Cart-in-progress per phone (items array as JSONB) — lives here, not in DDZ, because it's WhatsApp-specific |
| `storage.media` bucket | Inbound media (images, voice notes, docs) downloaded from Meta's short-lived URLs and stored permanently |

### Client Supabase (DDZ — `tllsgclvhponhtgafjxt`)

Owned by the client. The agent reads and writes selectively.

**Tables we READ from (never write):**
- `products`, `product_images`, `product_variants`, `categories` — catalog
- `orders`, `order_items` — for tracking
- `customers`, `profiles` — for identity matching

**Tables we CREATE for the agent (additive-only migration):**
- `chat_conversations` — persistent chat history per customer
- `ai_memory` — long-term facts/preferences per customer
- `support_knowledge_base` — KB articles for FAQ-style answers (currently empty placeholder)

**RPC functions we created on DDZ Supabase:**
| Function | Purpose |
|---|---|
| `find_user_by_whatsapp_phone(phone)` | Normalize a Ghanaian phone, match against customers/profiles |
| `get_order_for_tracking(order_no, email)` | Safe order lookup with email check |
| `get_ai_memories(customer_id)` | Load memories for prompt building |
| `fuzzy_product_search(query, limit, min_sim)` | pg_trgm-based typo-tolerant search |

**Extensions we enabled:**
- `pg_trgm` (in `extensions` schema) — for trigram similarity / fuzzy search
- GIN trigram indexes on `products.name`, `short_description`, `brand`, `slug`

**Why two databases?**
1. **Isolation of risk** — the agent has SERVICE_ROLE on its own DB but limited write surface on DDZ. We can never accidentally mass-update `products` or `orders`.
2. **Portability** — when cloning to a new client we keep the agent DB schema 100% identical; only the client DB changes.
3. **Multi-channel future** — if we add Instagram/SMS, they reuse `conversations`/`messages` on the agent DB while still writing into the client's chat_conversations.

### What if the new client doesn't have a Supabase database?

Two options — see [CLONING_GUIDE.md § 4](./CLONING_GUIDE.md#4-database-strategy-for-new-clients).

---

## 4. Repository Structure

```
oil/                                  ← repo root (legacy folder name)
├── DOCUMENTATION.md                  ← this file
├── CLONING_GUIDE.md                  ← step-by-step playbook for new clients
├── OPERATIONS.md                     ← day-2 runbook
├── README.md                         ← short intro / install
├── .env.example                      ← template — copy to .env.local
├── supabase-schema.sql               ← agent-side schema (idempotent)
├── package.json                      ← deps: next 16, openai, supabase-js, ffmpeg-static
├── next.config.ts
├── tsconfig.json
├── public/                           ← static assets, favicons
├── scripts/
│   ├── smoke-test-ddz.ts             ← local test of DDZ tools (no WhatsApp)
│   └── smoke-test-webhook.ts         ← end-to-end webhook simulator
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── webhook/route.ts      ← THE webhook (476 LOC) — orchestrates everything
    │   │   └── conversations/        ← REST for dashboard
    │   ├── globals.css               ← WhatsApp Web dark theme
    │   ├── layout.tsx
    │   └── page.tsx                  ← dashboard composition
    ├── components/                   ← Sidebar, MessageBubble, AudioPlayer, ChatHeader, ...
    └── lib/
        ├── ai.ts                     ← OpenRouter wrapper + multi-round tool loop
        ├── audio.ts                  ← ffmpeg transcoding for voice notes
        ├── crypto.ts                 ← signature/secret helpers
        ├── format.tsx                ← time/duration/bytes/initials/linkify
        ├── storage.ts                ← Supabase Storage upload helpers
        ├── supabase.ts               ← agent admin/server/browser clients
        ├── types.ts                  ← hand-maintained domain types
        ├── database.types.ts         ← auto-generated from Supabase schema
        ├── whatsapp.ts               ← Meta Cloud API: text, media, interactive, typing
        │
        │  ── DDZ-specific layer (everything below is per-client) ──
        │
        ├── ddz.ts                    ← DDZ Supabase admin client (separate creds)
        ├── ddz-identity.ts           ← phone → customer lookup
        ├── ddz-tools.ts              ← search_products, recommendations, track_order, variants
        ├── ddz-cart.ts               ← addToCart, removeFromCart, getCart, clearCart
        ├── ddz-orders.ts             ← startCheckout (POSTs to storefront)
        ├── ddz-store-info.ts         ← static "what payment / what delivery / store hours" info
        ├── ddz-llm-tools.ts          ← OpenAI function-calling schemas (12 tools)
        ├── ddz-tool-executor.ts      ← dispatcher: tool name → function
        ├── ddz-renderer.ts           ← turns "render hints" into WhatsApp Interactive messages
        ├── ddz-system-prompt.ts      ← dynamic system prompt builder
        └── ddz-persistence.ts        ← persistConversation, getMemoriesForCustomer
```

The `ddz-*` prefix on most lib files signals **client-specific code**. When cloning to a new client, replace these with `gsg-*` or `clientname-*` to make the per-client surface explicit.

---

## 5. Environment Variables

Full list with where to get each value:

### Meta WhatsApp
| Var | Where to get it |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Suite → Business Settings → Users → System Users → "Generate Token" with `whatsapp_business_messaging` + `whatsapp_business_management`. Choose **Never expire** (System User token). |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App → WhatsApp → API Setup. The numeric ID, NOT the phone number itself. |
| `WHATSAPP_VERIFY_TOKEN` | Any random string you choose. Reuse the same value in Meta App → WhatsApp → Configuration → Verify Token. |

### AI
| Var | Where to get it |
|---|---|
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `AI_MODEL` | Default `openai/gpt-4o-mini`. Must support function calling AND vision for full functionality. Other good options: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash-001`. |

### Agent's own Supabase
| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page — **secret, server-only** |

### Client's Supabase (DDZ)
| Var | Where to get it |
|---|---|
| `DDZ_SUPABASE_URL` | Client's Supabase project → Settings → API |
| `DDZ_SUPABASE_ANON_KEY` | Same |
| `DDZ_SUPABASE_SERVICE_ROLE_KEY` | Same — **secret, server-only** |

### Client's storefront
| Var | Where to get it |
|---|---|
| `DDZ_STOREFRONT_URL` | The client's storefront base URL (e.g. `https://www.discountdiscoveryzone.com`). Used by `ddz-orders.ts` to POST `/api/storefront/orders/create`. |

### Client branding (used in prompts and system messages)
| Var | Example |
|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | `Discount Discovery Zone` |
| `NEXT_PUBLIC_BRAND_PRIMARY_COLOR` | `#0E7C4A` |
| `NEXT_PUBLIC_BRAND_SUPPORT_PHONE` | `+233248615775` |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` | `support@discountdiscoveryzone.com` |

### App
| Var | Default |
|---|---|
| `PORT` | `3000` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (set to Vercel URL in production) |

> **Vercel:** add ALL of these via `vercel env add` or the dashboard Settings → Environment Variables. The `NEXT_PUBLIC_*` ones are inlined into the client bundle at build time.

---

## 6. Database Schemas

### Agent Supabase — see `supabase-schema.sql`

- `conversations` (id, phone unique, name, avatar_url, mode, unread_count, last_message_preview, last_message_type, is_typing, created_at, updated_at)
- `messages` (id, conversation_id FK, role, content, media_url, media_type, media_mime, media_filename, media_size_bytes, media_duration_secs, status, reply_to FK self, whatsapp_msg_id unique, created_at)
- `wa_cart_drafts` (phone PK, items JSONB, ddz_email, ddz_full_name, ddz_customer_id, notes, updated_at)
- Realtime publication on `conversations` + `messages`
- Storage bucket `media` (50 MB limit, public reads via direct URL)
- RLS: anon SELECT on conversations + messages (so Realtime works), service-role does writes

### DDZ Supabase — additive migration

Three tables created by the agent (everything else exists already in the storefront):

```sql
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,                     -- nullable: anonymous chats allowed
  channel text not null default 'whatsapp', -- whatsapp | instagram | sms | webchat
  channel_id text not null,             -- the phone number / IG PSID
  history jsonb not null default '[]',  -- [{role, content, ts}]
  metadata jsonb not null default '{}',
  sentiment text,
  message_count int not null default 0,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (channel, channel_id)
);

create table if not exists ai_memory (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  content text not null,
  importance text not null default 'medium', -- low | medium | high
  source text default 'whatsapp',
  created_at timestamptz default now()
);

create table if not exists support_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text,
  tags text[] default '{}',
  embedding vector(1536),                -- placeholder for future RAG
  created_at timestamptz default now()
);
```

RLS enabled on all three. Service role does all writes.

**RPCs:**
```sql
-- 1. Phone → customer resolver (handles +233 / 0 / 233 prefixes)
create function find_user_by_whatsapp_phone(p_phone text) returns table (...);

-- 2. Safe order lookup with email check
create function get_order_for_tracking(p_order_no text, p_email text) returns table (...);

-- 3. Fetch memories for prompt building
create function get_ai_memories(p_customer_id uuid) returns table (content text, importance text);

-- 4. Trigram fuzzy search (added latest)
create function fuzzy_product_search(p_query text, p_limit int, p_min_similarity real) returns table (id uuid, best_similarity real);
```

**Extensions:**
```sql
create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes for fast fuzzy matching
create index idx_products_name_trgm on products using gin (name extensions.gin_trgm_ops);
create index idx_products_short_description_trgm on products using gin (short_description extensions.gin_trgm_ops);
create index idx_products_brand_trgm on products using gin (brand extensions.gin_trgm_ops);
create index idx_products_slug_trgm on products using gin (slug extensions.gin_trgm_ops);
```

> **Critical**: this migration is **additive only**. It never touches `products`, `orders`, `customers`, or `profiles`. The full migration SQL is preserved in [CLONING_GUIDE.md § 5](./CLONING_GUIDE.md#5-applying-the-ddz-migration-to-a-new-client-db).

---

## 7. The Webhook Pipeline (Step-by-Step)

`src/app/api/webhook/route.ts` is the heart of the system. Every inbound message goes through this exact sequence:

### Step 1 — Verify
Meta sends a GET with `hub.verify_token` once when you set up the webhook. We compare and return the challenge.

### Step 2 — Parse and persist raw message
Decode the WhatsApp payload. Find or create a `conversations` row for the phone. **Detect first-contact** here — if we just created the row, set `isFirstContact = true`.

For media messages (image, voice, video, document, sticker):
1. Call Meta to get the short-lived download URL.
2. Download the bytes.
3. Upload to Supabase Storage `media` bucket.
4. Save the public URL on the `messages` row.

For text/interactive: just save the content.

### Step 3 — Resolve customer identity
Call `resolveWhatsAppIdentity(phone)` which:
1. Calls `find_user_by_whatsapp_phone(phone)` RPC on DDZ Supabase.
2. Tries phone variants (`+233xxx`, `0xxx`, `233xxx`).
3. Returns `{ isKnown, ddzCustomerId, displayName, email, normalized: { intl, local } }`.

If unknown, we still proceed with `isKnown: false` and `displayName: null`.

### Step 4 — Send first-contact welcome (if applicable)
If this is their very first message AND mode is "agent", send a one-shot welcome:
```
Hey [Name]! 👋 Welcome to [Brand]. We sell home essentials, kitchenware,
and more — with delivery across Ghana. What can I help you find today?
```
Save this to the `messages` table so it appears in the dashboard.

### Step 5 — Mark read + show typing indicator
Two parallel calls to Meta:
- `markWhatsAppMessageRead(msg.id)` → blue ticks on customer's phone
- `sendWhatsAppTyping(phone)` → real "typing…" bubble in WhatsApp

### Step 6 — Load chat history + memories
- Fetch last N turns from `chat_conversations.history` on DDZ Supabase
- Fetch top memories via `get_ai_memories(customer_id)` (only if known customer)

### Step 7 — Build the system prompt
Pass to `buildDDZSystemPrompt({ identity, cart, memories, isFirstContact })`. The prompt injects:
- Brand name, store hours, payment methods, delivery info
- The known customer block (or "first-time customer" block)
- Current cart contents
- Top memories
- Behavior rules and the checkout flow

See [§ 8](#8-the-ai-brain--system-prompt--tool-loop).

### Step 8 — Multi-round tool loop
Call `runAIWithTools()`. The model decides which tools to call (if any), we execute them, feed results back, repeat up to `MAX_TOOL_ROUNDS = 4` times. The final response includes:
- The text reply (already cleaned of `<think>` tags etc.)
- An array of "render hints" from every tool call

See [§ 9](#9-tools--what-the-ai-can-do).

### Step 9 — Send the AI text reply
`sendWhatsAppMessage(phone, reply)`. Persist the assistant message on the agent DB.

### Step 10 — Render any follow-up Interactive messages
`renderHints(phone, hints)` walks the array and sends:
- Product list cards (image + price + Add-to-cart button)
- Variant picker (Reply Buttons or List Message)
- Cart summary card
- Checkout success → "Pay with MoMo" CTA URL button

### Step 11 — Persist the new turn to DDZ
`persistConversation()` appends `{ role: "user", content }` and `{ role: "assistant", content }` to `chat_conversations.history`.

### Step 12 — Return 200 OK
Always return 200 quickly. If anything in steps 3-11 throws, log it but still return 200 — Meta retries on 5xx for 5 seconds, which would duplicate replies.

---

## 8. The AI Brain — System Prompt + Tool Loop

### The Multi-Round Tool Loop (`src/lib/ai.ts`)

```
┌────────────────────────────────────────────────────────────┐
│ Round 1                                                    │
│ ─ Send: system + history + new user message + 12 tools     │
│ ─ Model returns: tool_calls = [search_products("blender")] │
│ ─ Execute → 5 products + render hint                       │
│                                                            │
│ Round 2                                                    │
│ ─ Send: same context + tool_call + tool_result             │
│ ─ Model returns: tool_calls = [add_to_cart(prod_xyz)]      │
│ ─ Execute → cart updated                                   │
│                                                            │
│ Round 3                                                    │
│ ─ Send: same + new tool_result                             │
│ ─ Model returns: text reply ("Added to your cart 👍")      │
│ ─ DONE                                                     │
└────────────────────────────────────────────────────────────┘
Cap: 4 rounds. If still no text response, ask one more time
without tools.
```

### The System Prompt (`src/lib/ddz-system-prompt.ts`)

Built dynamically per request. Sections:

1. **Identity** — "You are a real human store attendant working at [Brand]…"
2. **Voice & Tone** — explicit WRONG/RIGHT phrasings ("I couldn't find any" → "We don't have any")
3. **Absolute Rules** — never reveal you're AI, never make up prices, never use markdown, keep replies SHORT
4. **Tool Discipline** — exactly when to call which tool
5. **Customer Block** — name/email/phone if known, "first-time" if not
6. **Cart Block** — current cart items
7. **Memories Block** — "What you remember about this customer"
8. **Checkout Flow** — strict 4-step flow with explicit confirmation
9. **First Contact Override** — if `isFirstContact`, "the system already greeted them, skip greetings"
10. **Store Policies** — payment methods (MoMo only), delivery (rider quotes fee on arrival)

The prompt is rebuilt from scratch on every message — it's a few KB so this is cheap.

---

## 9. Tools — What the AI Can Do

12 tools registered in `src/lib/ddz-llm-tools.ts`. Each has an OpenAI function-calling schema. Implementations live in the corresponding `ddz-*.ts` files.

| Tool | What it does | Implementation |
|---|---|---|
| `search_products(query, limit?)` | Catalog search with typo tolerance + relevance scoring | `ddz-tools.ts:searchProducts` |
| `get_recommendations(context?)` | Top-rated in-stock products, optionally narrowed | `ddz-tools.ts:getRecommendations` |
| `get_product_variants(product_id)` | List options for a variant product | `ddz-tools.ts:getProductVariants` |
| `add_to_cart(product_id, quantity?, variant_id?)` | Add to draft cart | `ddz-cart.ts:addToCart` |
| `remove_from_cart(product_id)` | Remove a line item | `ddz-cart.ts:removeFromCart` |
| `get_cart()` | Show current cart | `ddz-cart.ts:getCart` |
| `clear_cart()` | Empty the cart | `ddz-cart.ts:clearCart` |
| `start_checkout(name, address, city, region, delivery_method, ...)` | Create order on storefront + generate MoMo payment link | `ddz-orders.ts:startCheckout` |
| `track_order(order_number, email)` | Lookup with PII safety | `ddz-tools.ts:trackOrder` |
| `check_coupon(code)` | Validate a discount code | `ddz-tools.ts:checkCoupon` |
| `get_store_info(topic)` | Static info: payment methods, delivery, hours, returns | `ddz-store-info.ts` |

### Render Hints

Each tool returns `{ llm: string, hint: RenderHint }`. The `llm` part goes back to the model; the `hint` is consumed by the webhook to send native WhatsApp messages.

```typescript
type RenderHint =
  | { kind: "products"; products: DDZProduct[]; intro?: string }
  | { kind: "variants"; product: DDZProduct; variants: DDZVariant[] }
  | { kind: "cart"; cart: Cart }
  | { kind: "checkout_success"; result: CheckoutSuccess }
  | { kind: "order_card"; order: DDZOrder }
  | { kind: "none" };
```

The renderer (`src/lib/ddz-renderer.ts`) maps each hint kind to one or more Interactive WhatsApp messages.

---

## 10. Search Engine — Including Typo Tolerance

This is the most thoroughly-engineered piece of the agent. Three layers, scored together.

### Layer 1 — Literal candidates (the "guaranteed" pool)
For multi-token queries we run two extra strict queries:
1. **Exact phrase** in `name` (e.g. `name ILIKE '%stanley cup%'`).
2. **All meaningful tokens** in `name` (chained `ILIKE` clauses).

These guarantee a tight, high-confidence pool that can't be drowned out.

### Layer 2 — Broad candidates
A wide `OR` query across `name`, `description`, `short_description`, `slug`, `brand`, and `category_id`, with plural/singular variants generated by `generateSearchTerms()`. Limit 150.

### Layer 3 — Fuzzy candidates (typo tolerance)
Postgres `pg_trgm` extension with `strict_word_similarity()`. Called via the `fuzzy_product_search` RPC.

**Smart filtering:** per-token fuzzy is only run on tokens that have NO literal hits in Layer 2. Otherwise common words like "cup" would fuzzy-boost everywhere. The full phrase is always fuzzed too.

The fuzzy pass tracks per-(product, token) similarity in `fuzzyByTokenById: Map<id, Map<token, sim>>` so that fuzzy-matched tokens count toward the multi-token coverage bonus.

### Step 4 — Score and rank
`scoreProduct()` assigns:
- **+200** exact phrase in name (the holy grail)
- **+150** exact phrase in slug
- **+50** per token whole-word match in name
- **+25** per token substring match in name
- **+15** in slug, **+12** in brand, **+8** in short_desc, **+4** in desc, **+6** in tags
- **+120** if all user tokens are covered (literal OR fuzzy ≥ 0.3) — beats category match
- **+20** if category matches
- **+ Math.round(fuzzy * 150)** as fuzzy bonus

Then sort by score desc, in-stock desc, quantity desc, name asc.

### Why this works for typos

- `stanly` (single-letter typo) → `strict_word_similarity('stanly', 'Stanley')` = 0.5 → fuzzy bonus +75 → returns all Stanley products
- `stnaley cup` (transposed letters in one word + common word) → "stnaley" gets fuzzy hit on Stanley word, "cup" is literal → both tokens covered → +120 multi-token bonus → Stanley cup wins
- `cookwear` (wrong spelling) → fuzzy hit on cookware → returns all cookware products
- `wat about a stanly cup` (slang + typo) → "wat" filtered as stopword, "stanly" fuzzy hits Stanley, "cup" is literal → Stanley cup wins

Stopwords list now includes Pidgin abbreviations: `wat`, `pls`, `ur`, `lookin`, `wanna`, `gimme`, etc.

### Threshold tuning

| Threshold | Effect if too high | Effect if too low |
|---|---|---|
| `fuzzy_product_search.p_min_similarity = 0.3` | Misses transposition typos | Floods with garbage |
| Multi-token coverage `tokFuzzy >= 0.3` | "stnaley" doesn't count toward coverage | Hand-bag matches everything |
| Fuzzy bonus multiplier `* 150` | Typos can't beat literal matches | Typos crowd out clean queries |

Current values are battle-tested on the DDZ catalog.

---

## 11. Cart, Variants & Checkout Flow

### Cart Storage
Per-phone draft cart in `wa_cart_drafts` on the AGENT Supabase (NOT DDZ). Items are JSONB:

```typescript
type CartItem = {
  product_id: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  image: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
};
```

Why on the agent DB, not DDZ?
- Carts are channel-specific (a WhatsApp draft isn't the same as a web cart).
- We don't pollute the storefront with abandoned cart noise.
- We can wipe drafts without touching customer data.

### Variants
When a product has variants and the AI calls `add_to_cart` without a `variant_id`, we **reject** with a message telling the AI to call `get_product_variants` first. This forces the right UX flow:

1. `search_products` returns products. Cards show "Choose options" button (id `pickvar:productId`) for variant products.
2. Customer taps → maps to `Please show me the available options for product id X`.
3. AI calls `get_product_variants(X)` → returns options.
4. Renderer shows up to 3 as Reply Buttons OR up to 10 as a List Message. IDs encoded as `addvar:productId:variantId:1`.
5. Customer taps → maps to `Please add 1 of product X (variant Y)`.
6. AI calls `add_to_cart(productId, 1, variantId)`. Cart line uses variant price + image.

### Checkout Flow
Strictly enforced by the system prompt. Required fields:
1. first_name, last_name (from identity if known)
2. email (from identity if known)
3. phone (the WhatsApp number)
4. address, city, region (city ≠ region — region is one of Ghana's 16)
5. delivery_method: `doorstep` or `pickup` (only options — rider quotes fee for doorstep)

**Payment is Mobile Money ONLY.** No COD, no bank transfer at checkout. The Moolre payment link is generated automatically and sent as a "Pay with MoMo" tappable button.

### `startCheckout` implementation
1. Validate inputs (region in Ghana's 16, delivery_method enum, etc.).
2. POST to `${DDZ_STOREFRONT_URL}/api/storefront/orders/create` with the cart + shipping details.
3. The storefront creates the order in DDZ Supabase using its own business logic.
4. POST to `${DDZ_STOREFRONT_URL}/api/payment/moolre` to mint the payment link.
5. Clear the WhatsApp draft cart.
6. Return `{ ok: true, orderNumber, total, paymentUrl }`.

The webhook then renders a CTA URL button: "Pay with MoMo" → opens the link in browser.

> **Why POST to the storefront instead of writing directly to DDZ DB?**
> Order creation involves inventory decrements, tax math, coupon application, customer linking, payment provider hooks, etc. Reimplementing all of that in the agent would inevitably drift. Better to call the same endpoint the website uses.

---

## 12. Order Tracking

### `track_order(order_number, email)` — the safe-by-default contract

Returns one of four statuses:

| Status | When | What the AI says |
|---|---|---|
| `found` | Order exists AND email matches | Show details |
| `wrong_email` | Order exists but email doesn't match | "Hmm, that email doesn't match. Could you double-check?" |
| `not_found` | No order with that number | "We can't find an order with that number. Could you double-check?" |
| `missing_email` | AI called without email | (handled in tool executor — never reaches Meta) |

Implementation:
1. Try the secure RPC `get_order_for_tracking(order_no, email)` first.
2. If it returns nothing, do a direct query WITHOUT the email filter.
3. If THAT returns a row → `wrong_email`.
4. If THAT returns nothing → `not_found`.

The AI **must never reveal the actual email on file** — the system prompt enforces this.

### Tracking codes
The `order_number` parameter accepts any prefix (ORD-, SLI-, DDZ-, TRK-, etc.). The RPC normalizes by trimming whitespace and case-insensitive matching.

---

## 13. WhatsApp Interactive Messages

We use four Meta interactive types (`src/lib/whatsapp.ts`):

### 1. `sendWhatsAppButtons(phone, body, buttons[])`
Reply Buttons. Up to 3 buttons. Used for:
- Variant pickers (≤3 variants)
- Confirmation prompts ("Yes, place order" / "No, change something")

### 2. `sendWhatsAppList(phone, header, body, sections[])`
List Message. Up to 10 items in collapsible sections. Used for:
- Variant pickers (4–10 variants)

### 3. `sendWhatsAppCtaUrl(phone, body, ctaText, url)`
CTA URL Button. Single tappable button that opens a URL. Used for:
- "Pay with MoMo" → Moolre payment link
- "View on website" → product detail page

### 4. `sendWhatsAppImage(phone, imageUrl, caption?)`
Image with optional caption. Used for:
- Product cards (one per product, 4–5 cards per search result)

### Button ID conventions

```
add:productId:qty           ← simple add to cart
pickvar:productId           ← "Choose options" → triggers variant fetch
addvar:productId:variantId:qty  ← variant chosen, add to cart
more:productId              ← "Tell me more" → product details
pick:productId              ← generic select (used in lists)
```

The webhook's `interactiveToText()` translates these IDs into natural-language user messages the LLM can act on.

### Typing Indicator

`sendWhatsAppTyping(phone)` uses Meta's new `messages.read` + `typing_indicator` payload (Cloud API v22). It shows "typing…" in the customer's WhatsApp for 25 seconds or until we send a message. This dramatically improves perceived responsiveness.

---

## 14. Identity & Customer Resolution

`src/lib/ddz-identity.ts` resolves a WhatsApp phone to a DDZ customer.

### Phone normalization (Ghana-specific)
DDZ stores phones in three formats: `+233xxx`, `0xxx`, `233xxx`. The RPC normalizes:

```sql
-- Strip non-digits, then try:
--   1. as-is
--   2. with leading +
--   3. with 0 replaced by 233 / +233
--   4. with leading 233 / +233 stripped to 0xxx
```

Match against `customers.phone`, `profiles.phone`, and any other phone column the storefront uses.

### Returns
```typescript
type DDZIdentity = {
  isKnown: boolean;
  ddzCustomerId: string | null;
  ddzProfileId: string | null;
  displayName: string | null;
  email: string | null;
  normalized: { intl: string; local: string };
};
```

This is injected into every system prompt so the AI knows whether to greet by name and which email to use silently for tracking/checkout.

---

## 15. Persistence & Memory

### Conversation history
`chat_conversations.history` is a JSONB array of `{ role, content, ts }`. We keep the last ~20 turns and feed them to the LLM each request. Oldest turns drop off naturally.

### AI memory
`ai_memory` stores facts like `"Prefers MTN MoMo for payments"`, `"Lives in Tema, near Community 18"`, `"Always asks about kids products"`. The agent doesn't currently AUTO-write memories — that's a v2 feature. For now you'd insert manually via SQL or expose a `remember_fact` tool.

### Sentiment + metadata
`chat_conversations.sentiment` and `metadata` are populated lazily for analytics. Not currently consumed by the prompt.

---

## 16. Meta WhatsApp Cloud API — Full Setup

### One-time Meta App setup
1. https://developers.facebook.com → Create App → Business type
2. Add product: WhatsApp
3. WhatsApp → API Setup
   - Meta provides a free **test number** (limited to 5 verified recipient numbers)
   - For production: add a real phone number to your Business Account

### Adding a real phone number
1. WhatsApp Manager → Phone Numbers → Add Phone Number
2. Verify via SMS or voice call (the number must NOT have an active WhatsApp account on it — uninstall WhatsApp from the SIM first)
3. Select Display Name and category
4. Submit for review (auto-approved for most categories)

### After verification — TWO MORE STEPS often missed
**1. Register the number for Cloud API messaging:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/register" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```
The PIN is the 6-digit two-step verification PIN. **Change `123456` to a real one** after first registration.

**2. Subscribe the WABA to webhook events:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```
Without this, your webhook gets no inbound events even though the URL is configured. This step is per-WABA and easy to forget when adding a new number.

### Generating a permanent access token
1. Meta Business Suite → Business Settings
2. Users → System Users → Add (Admin role)
3. Assign WhatsApp Business Account
4. Generate New Token
   - App: pick the app from step 1
   - Token expiration: **Never**
   - Permissions: `whatsapp_business_messaging` + `whatsapp_business_management`
5. Copy the token — this is your `WHATSAPP_ACCESS_TOKEN`

### Webhook configuration
Meta App → WhatsApp → Configuration:
- Callback URL: `https://your-app.vercel.app/api/webhook`
- Verify Token: same string as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to webhook fields: `messages`

---

## 17. Deployment (Vercel)

### First deploy
```bash
vercel link        # link to a Vercel project (new or existing)
vercel env pull    # download envs from Vercel into .env.local (or push the other way)
vercel --prod
```

### Setting env vars on Vercel
```bash
vercel env add WHATSAPP_ACCESS_TOKEN production
# paste value when prompted
# repeat for every var in .env.example
```

Or use the dashboard: Settings → Environment Variables.

### Subsequent deploys
```bash
git push origin main   # triggers auto-deploy if GitHub is connected
# or:
vercel --prod
```

### Function timeout
The webhook is set to `maxDuration = 60` (seconds) in route.ts. Vercel Hobby limits to 10s, Pro to 60s. The AI tool loop typically completes in 3–8s, but slow models or many tool rounds can push it.

### Cold starts
Next.js + OpenAI SDK + Supabase = ~2s cold start. To minimize:
- Keep dependencies lean
- Pin `runtime = "nodejs"` (not edge — we need ffmpeg + Supabase admin)

---

## 18. Costs, Limits & Pricing

### Meta WhatsApp pricing (per conversation, 24h windows)
| Conversation type | Ghana | USA | Brazil |
|---|---|---|---|
| **Service** (customer-initiated, free entry) | Free if within 24h of customer message | Free | Free |
| **Marketing** (you initiate) | $0.0214 | $0.025 | $0.067 |
| **Utility** (order updates) | $0.005 | $0.0105 | $0.034 |
| **Authentication** (OTP) | $0.0036 | $0.0105 | $0.0315 |

Free tier: **1,000 service conversations / month** per phone number.

### OpenRouter / OpenAI
| Model | Input ($/1M tok) | Output ($/1M tok) |
|---|---|---|
| `openai/gpt-4o-mini` (current) | $0.15 | $0.60 |
| `openai/gpt-4o` | $2.50 | $10 |
| `anthropic/claude-3.5-sonnet` | $3 | $15 |
| `google/gemini-2.0-flash-001` | $0.075 | $0.30 |

Average DDZ conversation: ~5K input tokens (system + history + tool results) + ~200 output tokens. With gpt-4o-mini that's ~$0.0009 per turn.

### Supabase
- Free tier: 500MB DB + 1GB storage + 2GB bandwidth — enough for thousands of conversations
- Pro tier: $25/month — production recommended

### Vercel
- Hobby: free, 10s function limit (too short for our webhook)
- Pro: $20/month — required for 60s `maxDuration`

### Realistic monthly cost per client (1,000 conversations)
- Meta: $0 (under free tier)
- OpenRouter: ~$1
- Supabase: $25 (Pro, if using a dedicated project)
- Vercel: $20 (Pro, shared across clients)

→ **~$25-50 / client / month** in infra. Cost scales with conversation volume; a client with 10K convos/month would be ~$80-100.

### Rate limits
- **Meta tier 1** (default): 1,000 unique recipients in 24h
- **Tier 2** after 24h compliance: 10,000
- **Tier 3**: 100,000 — auto-promoted based on quality score
- **Cloud API**: 80 messages/sec sustained, 1,000 msg burst

---

## 19. Local Development & Testing

### Smoke test the DDZ tools (no WhatsApp)
```bash
npx tsx scripts/smoke-test-ddz.ts
```
Tests `searchProducts`, `getRecommendations`, `trackOrder`, etc. against live DDZ Supabase. Useful when tweaking the search algorithm.

### Smoke test the full webhook (no Meta)
```bash
npx tsx scripts/smoke-test-webhook.ts
```
Simulates an inbound message and runs the full pipeline end-to-end (without actually sending to WhatsApp). Validates: identity resolution → tool calls → render hints → persistence.

### Local webhook with ngrok
```bash
npm run dev
ngrok http 3000
# Set Meta callback URL to https://xxxxx.ngrok-free.app/api/webhook
```

### Vercel logs for live debugging
```bash
vercel logs --follow
```
Or view in dashboard. Key log markers:
- `[webhook] ...` — pipeline stages
- `[ai] ...` — tool loop rounds
- `[ddz-tools] searchProducts(...)` — search candidates and matches
- `[whatsapp] ...` — outbound API calls

---

## 20. Design Decisions & Why

### Why two Supabase projects?
Isolation. The agent has full SERVICE_ROLE on its own DB but a deliberately limited surface on the client's. We physically cannot mass-update `products` or delete `orders` by accident because the client's client wouldn't even be in scope without explicit `ddzAdminDb()` calls.

### Why store the cart on the agent DB, not DDZ?
Carts are **channel-specific**. A WhatsApp draft isn't the same as the customer's web cart. Mixing them would cause confusing dual-cart UX. Also: when we extend to Instagram/SMS, those channels each need their own draft state.

### Why POST to the storefront for order creation instead of writing the order directly?
Order creation has business logic the storefront already implements: inventory decrement, tax, coupons, customer linking, fulfillment hooks. Reimplementing it in the agent would inevitably diverge. Better to use the same code path the website uses.

### Why function-calling instead of RAG?
The catalog is structured (products table, orders table). Function calling gives the LLM precise, tool-driven access to live data without embedding tens of thousands of products. RAG would still be useful for FAQ/policy text — that's what `support_knowledge_base` is for, eventually.

### Why pg_trgm for fuzzy search instead of an external service?
- Already in Postgres — no extra infrastructure
- Sub-100ms with GIN trigram indexes
- Handles single-word typos (`stanly` → `Stanley`) and transpositions (`stnaley` → `Stanley`)
- More expensive options (Algolia, Typesense, vector embeddings) would add cost + latency

### Why GPT-4o-mini and not GPT-4o or Claude?
GPT-4o-mini is the sweet spot for our use case:
- Function calling: excellent
- Vision: yes (so we can "read" customer photos)
- Speed: ~2-3s per turn
- Cost: ~$0.001 per conversation

GPT-4o or Claude 3.5 Sonnet are smarter but 10x the cost and slower. Use them for clients with complex catalogs / nuanced queries.

### Why a strict checkout flow in the prompt?
LLMs love to be helpful. Without strict rules they'd ask "what's your name?" even when we know it, or skip critical fields like region. The prompt enforces:
- Use known data silently (don't re-ask)
- Ask ONE field at a time
- Show summary + get explicit confirmation BEFORE calling `start_checkout`
- Never quote a delivery price (rider does it)

### Why no markdown in replies?
WhatsApp doesn't render `**bold**` or `## headers`. They show up as literal characters. The prompt forbids them. The output cleaner (`cleanReply()` in `ai.ts`) strips any that leak through.

### Why interactive messages instead of plain text product lists?
- Tappable buttons close the loop without typing
- Images sell better than descriptions
- It's the WhatsApp-native UX — customers expect it

### Why is the webhook synchronous (blocks while AI runs)?
So the typing indicator works. If we `waitUntil` the AI call and return 200 immediately, the typing bubble disappears. Customers see "typing…" then a real response. The trade-off: Meta retries on 5xx after 5s. Our pipeline is reliably under 10s, so this is fine.

---

## 21. Known Limitations & Future Work

### Current limitations
- **No automatic memory writing.** The AI doesn't proactively save facts. Add a `remember_fact` tool or auto-summarize conversations periodically.
- **Single-tenant per deployment.** Each client = one Vercel project + one .env + (usually) one Supabase. See [CLONING_GUIDE.md](./CLONING_GUIDE.md) § 7 for the multi-tenant SaaS path.
- **No order modifications.** Customer can't cancel or edit an order via WhatsApp. They have to call/email support.
- **No Instagram yet.** The Cloud API has the same plumbing — see [CLONING_GUIDE.md § 8](./CLONING_GUIDE.md#8-future-instagram-integration).
- **Voice notes are transcribed by the LLM but not stored as text.** We send the audio bytes to GPT-4o-mini which has audio support.
- **No appointment booking, reservations, or membership flows.** This is a sales/support agent, not a CRM.

### Roadmap-friendly extensions
- **Sentiment-driven escalation** — flip `mode` to `human` automatically if sentiment dips
- **Marketing campaigns** — `POST /api/campaigns/send` to mass-message opted-in customers (template messages)
- **Multi-language** — system prompt switching based on detected language
- **Catalog sync to WhatsApp Catalog** — for the native "Catalog" UI inside WA chats
- **Stripe / Paystack / Hubtel** — alternate payment providers alongside Moolre
- **Webhook signature verification** — Meta supports HMAC-SHA256 signatures; we currently rely on the verify token only

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **WABA** | WhatsApp Business Account (the parent container for phone numbers) |
| **Phone Number ID** | Numeric ID Meta assigns to a phone (NOT the actual phone digits) |
| **System User Token** | Permanent (never-expires) access token tied to a Business System User |
| **Cloud API** | Meta-hosted WhatsApp Business API (vs. legacy On-Premise) |
| **Service conversation** | A 24h window started by the customer messaging you (free per Meta) |
| **Marketing conversation** | A window started by you sending a template (paid per Meta) |
| **Interactive message** | List Message, Reply Buttons, CTA URL Button, Catalog Message, etc. |
| **Render hint** | Internal type — guides the webhook to send follow-up Interactive messages |
| **Render hint** | Internal type from `ddz-tool-executor.ts` |
| **MoMo** | Mobile Money — dominant payment rail in Ghana (MTN, Vodafone Cash, AirtelTigo Money) |
| **Moolre** | Payment aggregator we use for MoMo collection |

---

## Appendix B — Quick Command Reference

| Task | Command |
|---|---|
| Start dev server | `npm run dev` |
| Smoke test DDZ tools | `npx tsx scripts/smoke-test-ddz.ts` |
| Smoke test webhook | `npx tsx scripts/smoke-test-webhook.ts` |
| Deploy to Vercel | `vercel --prod` |
| Tail Vercel logs | `vercel logs --follow` |
| Apply DB migration via MCP | (use Supabase MCP `apply_migration` tool) |
| Check Meta phone status | `curl -H "Authorization: Bearer $TOKEN" https://graph.facebook.com/v22.0/{PHONE_ID}` |
| Re-register phone for Cloud API | `curl -X POST .../v22.0/{PHONE_ID}/register -d '{"messaging_product":"whatsapp","pin":"123456"}'` |
| Subscribe WABA to webhook | `curl -X POST .../v22.0/{WABA_ID}/subscribed_apps` |

---

*Last updated: 2026-05-05*
