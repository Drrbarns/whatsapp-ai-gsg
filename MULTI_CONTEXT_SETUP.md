# GSG Multi-Context Setup — what's done & what's left

The GSG WhatsApp agent (`whatsapp-ai-gsg`) now serves **three different
products from one WhatsApp number** via a context router:

| Context | Triggers | Tools | Backend |
|---|---|---|---|
| **goods** | "shop", product names, "do you have X" | full e-commerce tool set | GSG storefront Supabase + storefront `/api/checkout` |
| **brand** | first contact, "hi", "menu", general questions, link-only units | none (LLM + CTA renderer) | none |
| **escrow** | "escrow", "sbbs", "scammed", "SBS-XXXXXXXX", "dispute" | lookup/list transactions, dispute summary, send SBBS link | escrow backend `/api/wa/*` |

Routing is deterministic (regex + keyword), with sticky context per phone
number (`conversations.active_context`).

---

## ✅ What's already done (in this repo)

- `src/contexts/goods/` — moved from `src/lib/gsg-*` (no behaviour change)
- `src/contexts/brand/` — concierge persona for the whole GSG ecosystem
- `src/contexts/escrow/` — SBBS support (talks to escrow backend over HTTP)
- `src/lib/intent-router.ts` + `src/lib/context-state.ts`
- Webhook refactored to dispatch by context
- `supabase-schema.sql` adds the `active_context` column (idempotent)
- 23/23 router tests pass (`npx tsx scripts/smoke-test-router.ts`)
- Production build is clean

---

## 🔧 What you still need to do

### 1. Apply the agent's own DB schema (when the new Supabase project exists)

```bash
# In the GSG agent's NEW Supabase project SQL editor:
# Paste the contents of supabase-schema.sql and run.
```

This adds the `active_context` column to `conversations`. **The agent
defaults to `brand` if the column is missing**, so this is non-blocking — it
just means context stickiness won't persist across restarts until applied.

### 2. Apply the GSG storefront migration (still pending from before)

```bash
# In GSG storefront Supabase (vlflpclhtvuyxcdvlvkt) SQL editor:
# Paste migrations/001_gsg_storefront_wa_agent.sql and run.
```

This is the migration we couldn't run via MCP due to permissions. Without
it, `track_order` and customer identity lookup won't work. The 5/7 smoke
test pass rate becomes 7/7 once this is applied.

### 3. Deploy the new escrow backend endpoints

The escrow context calls these endpoints — they need to ship before the
escrow context will work:

**Files I added/modified in `~/Documents/Websites/gsgescrow/`:**

| File | Change | Why |
|---|---|---|
| `backend/src/middleware/wa-auth.ts` | NEW | Bearer-token auth + phone-header scoping |
| `backend/src/routes/wa.ts` | NEW | `/whoami`, `/transactions/lookup`, `/transactions/mine`, `/disputes/by-transaction` |
| `backend/src/index.ts` | +2 lines | Imports + mounts `/api/wa` |
| `backend/.env.example` | +6 lines | Documents `WA_AGENT_API_KEY` |
| `backend/src/routes/transactions.ts` | 1-line bug fix | `grandTotal` → `fees.grand_total` (was a pre-existing TS error blocking `npm run build`) |

**Steps:**

```bash
cd ~/Documents/Websites/gsgescrow/backend
npm run build         # confirms my changes compile
git add src/middleware/wa-auth.ts src/routes/wa.ts src/index.ts \
        src/routes/transactions.ts .env.example
git commit -m "feat(wa): add /api/wa/* endpoints for GSG WhatsApp agent"
# (then deploy to Vercel as usual)
```

**Set the env var on the escrow backend's Vercel project:**

```bash
WA_AGENT_API_KEY=<generate with: openssl rand -hex 32>
```

Without `WA_AGENT_API_KEY` set, the `/api/wa/*` endpoints return 503 (safe
default — protects against accidental open-internet exposure).

### 4. Configure the agent to talk to the escrow backend

In the GSG agent's `.env.local` (and Vercel env vars), set:

```env
ESCROW_API_BASE_URL=https://api.sellbuysafe.gsgbrands.com
ESCROW_WA_API_KEY=<same value you set on the escrow backend>
```

### 5. Test live

Once env vars are set on both deployments:

```
You text the bot: "hi"
  → brand greeting + offer to help
You text: "do you have rice"
  → switches to goods context (active_context = goods)
You text: "menu"
  → back to brand, sends WhatsApp List with all 6 business units
You text: "what's the status of SBS-12345678"
  → switches to escrow, looks up the transaction, sends a transaction card
You text: "I want to send a parcel to Kumasi"
  → brand context detects courier intent, sends a CTA to courier.gsgbrands.com.gh
```

---

## How adding more business units works

When you build a dedicated agent for, say, Personal Shopper:

1. Create `src/contexts/personal_shopper/` (system-prompt, tools, executor, renderer, handle)
2. In `src/lib/context-state.ts`, add `"personal_shopper"` to `ContextKey`
3. In `src/contexts/brand/knowledge.ts`, set `BUSINESS_UNITS` entry's
   `hasAgent: true`
4. In `src/lib/intent-router.ts`, add a case mapping the intent → personal_shopper
5. In `src/app/api/webhook/route.ts`, add a dispatch branch
6. In `supabase-schema.sql`, extend the `active_context` check constraint

That's it — same pattern for every new vertical.

---

## Architecture summary

```
WhatsApp inbound message
        │
        ▼
   webhook/route.ts
        │
        ├─ persist raw message
        ├─ resolve identity (goods identity for now)
        ├─ get active_context (defaults to "brand")
        ├─ routeMessage()  ──── regex → intent → sticky → first-contact → brand
        │       │
        │       ▼ may switch context
        │
        ├─ setActiveContext() if switched
        │
        ├─ dispatch:
        │     goods    → handleGoods()    (LLM + 14 tools + product-card render)
        │     brand    → handleBrand()    (LLM only, no tools, CTA render)
        │     escrow   → handleEscrow()   (LLM + 4 tools, escrow-card render)
        │
        ├─ send text reply
        ├─ render() any context-specific follow-ups (cards, CTAs, lists)
        └─ persist conversation turn
```
