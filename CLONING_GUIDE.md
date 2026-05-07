# Cloning Guide — Deploying the WhatsApp AI Agent for a New Client

> Step-by-step playbook for taking this codebase and standing up a working WhatsApp AI agent for a NEW business. Read [DOCUMENTATION.md](./DOCUMENTATION.md) first to understand the architecture.

This guide assumes you're cloning the entire project for one client (clone-per-client model). For multi-tenant SaaS see [§ 7](#7-multi-tenant-saas-path-future).

---

## Table of Contents

1. [The Big Picture — What Changes Per Client](#1-the-big-picture--what-changes-per-client)
2. [Prerequisites Checklist](#2-prerequisites-checklist)
3. [Step-by-Step Setup](#3-step-by-step-setup)
4. [Database Strategy for New Clients](#4-database-strategy-for-new-clients)
5. [Applying the DDZ-Style Migration to a New Client DB](#5-applying-the-ddz-style-migration-to-a-new-client-db)
6. [Customizing the Agent for the Client](#6-customizing-the-agent-for-the-client)
7. [Multi-Tenant SaaS Path (Future)](#7-multi-tenant-saas-path-future)
8. [Future: Instagram Integration](#8-future-instagram-integration)
9. [Common Pitfalls & Fixes](#9-common-pitfalls--fixes)
10. [Per-Client Onboarding Checklist](#10-per-client-onboarding-checklist)

---

## 1. The Big Picture — What Changes Per Client

When cloning to a new client (let's call them "GSG"), here's what's identical and what's different:

### Stays the same (the framework)
- Webhook pipeline (`src/app/api/webhook/route.ts`)
- AI orchestration (`src/lib/ai.ts`)
- WhatsApp Cloud API wrapper (`src/lib/whatsapp.ts`)
- Dashboard UI components
- Supabase Storage media handling
- Agent's own DB schema (conversations, messages, wa_cart_drafts)

### Changes per client (the business layer)
- **Branding** — `NEXT_PUBLIC_BRAND_*` env vars
- **System prompt** — `src/lib/ddz-system-prompt.ts` → `src/lib/gsg-system-prompt.ts`
- **Tool implementations** — `ddz-tools.ts`, `ddz-cart.ts`, `ddz-orders.ts` adapted to GSG's schema
- **Identity resolver** — `ddz-identity.ts` adjusted to GSG's customer table format
- **Storefront integration** — `DDZ_STOREFRONT_URL` and the order-create endpoint
- **Payment provider** — Moolre vs. Paystack vs. Stripe etc.
- **Store info** — `ddz-store-info.ts` (delivery zones, hours, payment methods, return policy)
- **Categories supported** — different products mean different tools (e.g. fashion → variant logic critical; food delivery → menu items + customizations)

### Changes per Meta phone
- New WhatsApp Phone Number ID
- Same Meta App is fine — see [§ 6.7](#67-decision-tree-do-i-need-a-new-meta-app-)

### Hosting
- New Vercel project (or new domain on shared Vercel project)
- New Supabase project for the agent (or shared if SaaS path)

---

## 2. Prerequisites Checklist

Before starting:

- [ ] **GitHub access** — write access to a new repo for the client (e.g. `whatsapp-ai-gsg`)
- [ ] **Vercel account** with Pro plan (for 60s function timeout)
- [ ] **Supabase account** with capacity for one new project
- [ ] **OpenRouter API key** (can be shared across clients or per-client)
- [ ] **Meta Business account** with Admin access
  - WABA created and verified
  - At least one phone number ready to add (MUST not have an active personal WhatsApp on the SIM)
  - Permanent System User access token (or you can create a new one)
- [ ] **Client's storefront** is accessible (URL, API endpoints documented)
- [ ] **Client's Supabase credentials** OR access to their database
- [ ] **Client's payment provider** documented (Moolre / Paystack / Hubtel / Stripe / etc.)
- [ ] **A real phone (your test phone)** that can be added as a test recipient

---

## 3. Step-by-Step Setup

### 3.1 Clone the repo

```bash
cd ~/Documents/Websites
cp -R oil GSGAI         # or however you organize
cd GSGAI
rm -rf .git node_modules .next .vercel
git init
```

If you want to keep history, instead:
```bash
git clone https://github.com/Drrbarns/whatsapp-ai-agent.git GSGAI
cd GSGAI
rm -rf .vercel
```

### 3.2 Create the new GitHub repo

```bash
gh repo create Drrbarns/whatsapp-ai-gsg --private --source=. --remote=origin
git add -A
git commit -m "Initial fork from oil/ for GSG client"
git push -u origin main
```

### 3.3 Create the agent's Supabase project

1. https://supabase.com → New Project
2. Name: `whatsapp-agent-gsg`
3. Region: closest to client (Africa: `eu-west-2` London is current closest until AWS Cape Town has Supabase)
4. Wait for provisioning (~2 min)
5. Project Settings → API → copy `URL`, `anon key`, `service_role key`

### 3.4 Apply the agent schema

In Supabase SQL Editor, paste and run `supabase-schema.sql` from the repo. This creates:
- `conversations`, `messages`, `wa_cart_drafts` tables
- All indexes
- RLS policies
- The `media` storage bucket
- Realtime publications

Verify with:
```sql
select table_name from information_schema.tables where table_schema = 'public';
-- Should show: conversations, messages, wa_cart_drafts
```

### 3.5 Set up the client's database access

See [§ 4](#4-database-strategy-for-new-clients). Three paths:

**Path A — Client has Supabase already** (best case):
- Get credentials from client
- Apply the additive migration ([§ 5](#5-applying-the-ddz-style-migration-to-a-new-client-db))
- Set `GSG_SUPABASE_URL`, `GSG_SUPABASE_SERVICE_ROLE_KEY` in env

**Path B — Client has a different database** (Mongo, MySQL, REST API):
- Don't share a DB — call the storefront's API for everything
- Replace `gsg-tools.ts` to fetch via HTTP instead of Supabase queries
- See [§ 6.4](#64-tools-using-rest-instead-of-supabase)

**Path C — Client has nothing** (you're building the storefront too):
- Create a new Supabase for them with the schema your storefront needs
- Same setup as Path A from there on

### 3.6 Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Meta WhatsApp (NEW per client)
WHATSAPP_ACCESS_TOKEN=<from Meta System User>
WHATSAPP_PHONE_NUMBER_ID=<from Meta App > WhatsApp > API Setup>
WHATSAPP_VERIFY_TOKEN=gsgaiverifytoken123      # any random string

# AI (can be shared across clients)
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=openai/gpt-4o-mini

# Agent's Supabase (NEW per client)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Client's storefront DB (NEW per client) — rename DDZ_ → GSG_
GSG_SUPABASE_URL=https://yyy.supabase.co
GSG_SUPABASE_ANON_KEY=eyJ...
GSG_SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Client's storefront URL
GSG_STOREFRONT_URL=https://www.gsg.com.gh

# Client branding
NEXT_PUBLIC_BRAND_NAME=GSG
NEXT_PUBLIC_BRAND_PRIMARY_COLOR=#FF5722
NEXT_PUBLIC_BRAND_SUPPORT_PHONE=+233xxxxxxxxx
NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=support@gsg.com.gh

PORT=3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3.7 Rename the DDZ-prefixed files

Find/replace `DDZ` → `GSG` and `ddz` → `gsg` across the codebase:

```bash
# Rename files
for f in src/lib/ddz-*.ts; do
  mv "$f" "$(echo $f | sed 's/ddz-/gsg-/')"
done
mv src/lib/ddz.ts src/lib/gsg.ts

# Find/replace in code
grep -rl 'ddz' src/ --include='*.ts' | xargs sed -i '' 's/ddz/gsg/g'
grep -rl 'DDZ' src/ --include='*.ts' | xargs sed -i '' 's/DDZ/GSG/g'

# Verify the build still passes
npm install
npm run build
```

> **Why rename?** It makes the per-client surface visually obvious. When you're scrolling code six months from now you immediately see "this is GSG-specific" vs "this is framework".

### 3.8 Adapt the tools to the client's schema

This is where you spend the most time. Walk through each `gsg-*.ts` file and adapt the SQL queries / table names / column names to match the client's schema.

See [§ 6.2](#62-adapting-tools-to-a-different-product-schema) for a worked example.

### 3.9 Adapt the system prompt

Open `src/lib/gsg-system-prompt.ts` and:
- Replace "Discount Discovery Zone" branding (or just rely on env vars)
- Update store policies (delivery zones, payment methods, return policy)
- Update the checkout flow to match the client's actual flow
- Update tool discipline if you removed any tools

### 3.10 Create the new Meta app config

If reusing the same Meta app (recommended — see [§ 6.7](#67-decision-tree-do-i-need-a-new-meta-app-)):

1. Add the new WABA + phone number to the existing app
2. Subscribe the new WABA to the webhook:
   ```bash
   curl -X POST "https://graph.facebook.com/v22.0/{NEW_WABA_ID}/subscribed_apps" \
     -H "Authorization: Bearer {ACCESS_TOKEN}"
   ```
3. Register the new phone for Cloud API:
   ```bash
   curl -X POST "https://graph.facebook.com/v22.0/{NEW_PHONE_ID}/register" \
     -H "Authorization: Bearer {ACCESS_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"messaging_product":"whatsapp","pin":"123456"}'
   ```

If creating a new Meta app:
- New app → Add WhatsApp product
- New phone number under that app's WABA
- Generate a new System User token
- Webhook config → set callback URL once Vercel is live

### 3.11 Deploy to Vercel

```bash
vercel link            # link to a new Vercel project
vercel --prod          # first deploy
```

Then add all env vars:
```bash
# For each var in .env.local:
vercel env add VAR_NAME production
# paste value when prompted
```

Or use the dashboard. Don't forget the `NEXT_PUBLIC_*` ones.

Redeploy to pick up envs:
```bash
vercel --prod
```

### 3.12 Configure the Meta webhook

Now that Vercel gave you `https://whatsapp-ai-gsg.vercel.app`:

Meta App → WhatsApp → Configuration:
- Callback URL: `https://whatsapp-ai-gsg.vercel.app/api/webhook`
- Verify Token: same as `WHATSAPP_VERIFY_TOKEN` env
- Subscribe to webhook fields: `messages`
- Click "Verify and save" — should succeed instantly

### 3.13 Add yourself as a test recipient (test number only)

If using the Meta-provided test number:
- Meta App → WhatsApp → API Setup → "To" field → add up to 5 verified test recipients
- For your real phone: enter, get code via WhatsApp, verify

If using a real phone number: skip this — anyone can message it.

### 3.14 End-to-end smoke test

1. Send a text message from your test phone to the WhatsApp number
2. You should see "typing…" indicator within ~1s
3. Reply arrives within 5-10s
4. Open the dashboard at `https://whatsapp-ai-gsg.vercel.app` — your conversation appears in real time
5. Try a search: "do you have any X"
6. Try a typo: "stnaley cup" or whatever the GSG equivalent is
7. Try the cart flow: "add 2 of [product] to my cart"
8. Try checkout (use a test product if possible)

### 3.15 Monitor logs

```bash
vercel logs --follow
```

Look for:
- `[webhook] ...` — every message
- `[ai] tool round X` — multi-round tool loop
- `[gsg-tools] searchProducts(...)` — search results
- `[whatsapp] sent ...` — outbound API calls

If anything errors, fix and `vercel --prod` again.

---

## 4. Database Strategy for New Clients

The single most important architectural decision per client.

### Option A — Client uses Supabase (BEST)

Same setup as DDZ:
- Get the client's `URL`, `service_role key`
- Apply the additive migration ([§ 5](#5-applying-the-ddz-style-migration-to-a-new-client-db))
- The agent reads/writes via service role, but ONLY on tables we created + safe RPCs

**Pros:** identical pattern to DDZ, fastest setup, real-time queries
**Cons:** you have full DB access — be disciplined about not touching their tables

### Option B — Client uses a different SQL DB (Postgres, MySQL, etc.)

You can either:
1. Run a read replica into Supabase (overkill for small catalogs)
2. **Recommended:** call the client's REST API for all reads/writes

In this case the `gsg-tools.ts` file stops talking to a database and instead uses `fetch()`:

```typescript
export async function searchProducts(query: string, limit = 5) {
  const res = await fetch(`${process.env.GSG_STOREFRONT_URL}/api/products/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) return [];
  const { products } = await res.json();
  return products.map(mapProduct);
}
```

You lose:
- Pg trgm fuzzy search (unless the storefront API exposes it)
- Direct DB efficiency (every search = one HTTP call)

You gain:
- No DB access concerns — the storefront enforces its own rules
- Works with any backend (Node, Rails, Django, Laravel, etc.)

### Option C — Client has no database (you're building the storefront)

Just create a new Supabase for them and design your schema as you would normally. Then follow Option A.

### Option D — Client uses a SaaS platform (Shopify, WooCommerce, etc.)

Use the platform's API:
- **Shopify Storefront API** — GraphQL, fast, well-documented
- **WooCommerce REST API** — solid, but slower
- **Square / BigCommerce / etc.** — each has its own API

Replace tools with API calls. Same pattern as Option B. You'll likely also need:
- OAuth setup (or API key) per client
- Pagination handling (catalogs > 250 items)
- Rate limiting awareness

### Quick decision matrix

| Client setup | Strategy |
|---|---|
| Supabase + DDZ-like schema | Option A (5 min) |
| Supabase + custom schema | Option A + adapt queries (1-2h) |
| Postgres/MySQL with API | Option B (4-8h) |
| Postgres/MySQL no API | Option B + add /api endpoints to their app first |
| Shopify | Option D (8-16h) |
| WooCommerce | Option D (8-16h) |
| You're building it | Option C (custom timeline) |

---

## 5. Applying the DDZ-Style Migration to a New Client DB

If the client uses Supabase, run this migration to add the agent infrastructure. It's **additive only** — never modifies their existing tables.

```sql
-- ============================================================================
-- WhatsApp AI Agent — additive infrastructure for client DB
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Enable pg_trgm for typo-tolerant fuzzy search
create extension if not exists pg_trgm with schema extensions;

-- 2. Trigram indexes on the searchable product fields
create index if not exists idx_products_name_trgm
  on public.products using gin (name extensions.gin_trgm_ops);
create index if not exists idx_products_short_description_trgm
  on public.products using gin (short_description extensions.gin_trgm_ops);
create index if not exists idx_products_brand_trgm
  on public.products using gin (brand extensions.gin_trgm_ops);
create index if not exists idx_products_slug_trgm
  on public.products using gin (slug extensions.gin_trgm_ops);

-- 3. chat_conversations — persistent chat history per channel/customer
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  channel text not null default 'whatsapp',  -- whatsapp | instagram | sms | webchat
  channel_id text not null,                   -- phone number / IG PSID
  history jsonb not null default '[]',
  metadata jsonb not null default '{}',
  sentiment text,
  message_count int not null default 0,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (channel, channel_id)
);
alter table public.chat_conversations enable row level security;
create index if not exists idx_chat_conversations_customer on public.chat_conversations(customer_id);
create index if not exists idx_chat_conversations_updated on public.chat_conversations(updated_at desc);

-- 4. ai_memory — long-term per-customer facts
create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  content text not null,
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high')),
  source text default 'whatsapp',
  created_at timestamptz default now()
);
alter table public.ai_memory enable row level security;
create index if not exists idx_ai_memory_customer on public.ai_memory(customer_id, created_at desc);

-- 5. support_knowledge_base — for FAQ-style answers (placeholder)
create table if not exists public.support_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text,
  tags text[] default '{}',
  created_at timestamptz default now()
);
alter table public.support_knowledge_base enable row level security;

-- 6. RPC: phone → customer (adapt the table/column names to client's schema)
create or replace function public.find_user_by_whatsapp_phone(p_phone text)
returns table (customer_id uuid, profile_id uuid, display_name text, email text)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_clean text;
  v_local text;
  v_intl text;
begin
  v_clean := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_clean) = 0 then return; end if;

  -- Ghana normalization: produce both 0xxx and +233xxx variants
  if v_clean like '233%' then
    v_intl  := '+' || v_clean;
    v_local := '0' || substring(v_clean from 4);
  elsif v_clean like '0%' then
    v_local := v_clean;
    v_intl  := '+233' || substring(v_clean from 2);
  else
    v_intl  := '+' || v_clean;
    v_local := v_clean;
  end if;

  return query
    -- ADAPT THIS QUERY: replace `customers` with the client's actual table
    select c.id, c.profile_id, c.full_name, c.email
    from public.customers c
    where c.phone in (v_intl, v_local, v_clean, p_phone)
    limit 1;
end;
$$;
grant execute on function public.find_user_by_whatsapp_phone(text)
  to anon, authenticated, service_role;

-- 7. RPC: safe order tracking
create or replace function public.get_order_for_tracking(p_order_no text, p_email text)
returns table (
  id uuid,
  order_number text,
  status text,
  payment_status text,
  total numeric,
  currency text,
  tracking_number text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  -- ADAPT THIS QUERY: replace `orders` columns with the client's actual schema
  select o.id, o.order_number, o.status, o.payment_status, o.total, o.currency,
         o.tracking_number, o.created_at
  from public.orders o
  where (lower(trim(o.order_number)) = lower(trim(p_order_no))
         or lower(trim(coalesce(o.tracking_number, ''))) = lower(trim(p_order_no)))
    and lower(trim(coalesce(o.email, ''))) = lower(trim(p_email))
  limit 1;
$$;
grant execute on function public.get_order_for_tracking(text, text)
  to anon, authenticated, service_role;

-- 8. RPC: get AI memories
create or replace function public.get_ai_memories(p_customer_id uuid)
returns table (content text, importance text)
language sql stable security definer set search_path = public
as $$
  select content, importance
  from public.ai_memory
  where customer_id = p_customer_id
  order by case importance when 'high' then 1 when 'medium' then 2 else 3 end,
           created_at desc
  limit 20;
$$;
grant execute on function public.get_ai_memories(uuid)
  to anon, authenticated, service_role;

-- 9. RPC: trigram fuzzy product search
create or replace function public.fuzzy_product_search(
  p_query text,
  p_limit int default 20,
  p_min_similarity real default 0.3
) returns table (id uuid, best_similarity real)
language sql stable security definer
set search_path = public, extensions
as $$
  select p.id,
         greatest(
           strict_word_similarity(p_query, coalesce(p.name,'')),
           strict_word_similarity(p_query, coalesce(p.short_description,'')) * 0.85,
           strict_word_similarity(p_query, coalesce(p.brand,''))             * 0.9,
           strict_word_similarity(p_query, coalesce(p.slug,''))              * 0.7,
           similarity(p_query, coalesce(p.name,''))                          * 0.6
         )::real as best_similarity
  from public.products p
  where p.status = 'active'
    and greatest(
          strict_word_similarity(p_query, coalesce(p.name,'')),
          strict_word_similarity(p_query, coalesce(p.short_description,'')) * 0.85,
          strict_word_similarity(p_query, coalesce(p.brand,''))             * 0.9,
          strict_word_similarity(p_query, coalesce(p.slug,''))              * 0.7,
          similarity(p_query, coalesce(p.name,''))                          * 0.6
        ) >= p_min_similarity
  order by best_similarity desc, p.rating_avg desc nulls last
  limit greatest(p_limit, 1);
$$;
grant execute on function public.fuzzy_product_search(text, int, real)
  to anon, authenticated, service_role;
```

**Adapt as needed:**
- Step 6: replace `customers` table reference with the client's actual customer/user table. Match the columns they use (`name` vs `full_name`, etc.).
- Step 7: replace `orders` columns. Some clients call it `total_amount`, `grand_total`, etc.
- Step 9: if `products` doesn't have `short_description` / `brand` / `rating_avg`, drop those fields from the function.

Apply via Supabase SQL Editor or MCP `apply_migration`.

---

## 6. Customizing the Agent for the Client

### 6.1 Branding

Just edit `.env.local`:
```env
NEXT_PUBLIC_BRAND_NAME=GSG
NEXT_PUBLIC_BRAND_PRIMARY_COLOR=#FF5722
NEXT_PUBLIC_BRAND_SUPPORT_PHONE=+233xxxxxxxxx
NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=support@gsg.com.gh
```

The system prompt and dashboard pick these up automatically.

### 6.2 Adapting tools to a different product schema

Most fields will be similar but renamed. Walk through `gsg-tools.ts`:

**DDZ schema:**
```typescript
type RawProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  quantity: number;             // stock
  brand: string | null;
  rating_avg: number | null;
  description: string;
  short_description: string;
  tags: string[];
  product_images: { url: string; position: number }[];
  product_variants: { id: string }[];
};
```

**GSG might have:**
```typescript
type RawProduct = {
  product_id: string;           // not 'id'
  title: string;                // not 'name'
  handle: string;               // not 'slug'
  price_cents: number;          // pence, not units
  inventory_qty: number;        // not 'quantity'
  vendor: string;               // not 'brand'
  rating: { average: number };  // nested
  body_html: string;            // not 'description'
  images: string[];             // string array, not objects
  variants: { variant_id: string }[];
};
```

Update the SELECT clauses and the `mapProduct()` function to translate.

For prices in cents, divide by 100 in mapProduct.

For nested rating, flatten in the SELECT or in mapProduct.

If they don't have variants at all, the variant tools become no-ops — set `hasVariants: false` always.

### 6.3 Adapting checkout

`ddz-orders.ts` POSTs to `${DDZ_STOREFRONT_URL}/api/storefront/orders/create` with a specific payload shape. The client's storefront will have a different endpoint and payload.

Three options in priority order:

1. **Best:** the storefront has a JSON order-create endpoint. Just call it with the right payload.
2. **OK:** the storefront uses Shopify/WooCommerce. Use their official order-create API.
3. **Last resort:** the storefront has no API. Either insert directly into `orders` table (risky — must replicate inventory decrement, tax, etc.) OR don't support full checkout via WhatsApp; instead generate a tappable "Continue checkout on website" button with the cart pre-loaded.

### 6.4 Tools using REST instead of Supabase

Example: replace `searchProducts` to call a REST endpoint:

```typescript
// src/lib/gsg-tools.ts
export async function searchProducts(query: string, limit = 5): Promise<GSGProduct[]> {
  const url = new URL(`${process.env.GSG_STOREFRONT_URL}/api/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${process.env.GSG_API_KEY}` },
  });
  if (!res.ok) {
    console.error("[gsg-tools] search failed:", res.status);
    return [];
  }
  const { products } = await res.json();
  return products.map(mapProduct);
}
```

You lose the multi-layer fuzzy logic unless the API exposes it. Most modern e-commerce APIs (Shopify, BigCommerce) have decent built-in search.

### 6.5 Adapting the system prompt

Open `gsg-system-prompt.ts` and look for these sections:
- **STORE POLICIES** — replace DDZ-specific delivery + payment text
- **CHECKOUT FLOW** — match the actual fields the storefront wants
- **TOOL DISCIPLINE** — remove tools you don't have
- **ESCALATION** — update the support phone/email (or pull from env)

If the client has a totally different vertical (e.g. food delivery vs. retail):
- Add tools like `get_menu`, `add_item_with_customization`
- Remove tools like `track_order` if the storefront doesn't expose it
- Adjust voice/tone (a dental clinic should sound different from a perfume store)

### 6.6 Adapting payment provider

If GSG uses Paystack instead of Moolre:
- `gsg-orders.ts` `startCheckout` — replace the Moolre POST with Paystack init
- Render hint `checkout_success` — generate the Paystack URL
- The button label might change ("Pay with Paystack" instead of "Pay with MoMo")

If they use multiple providers:
- Add a tool `get_payment_options(cart_total)` that returns the providers available
- AI presents a list, customer picks, you generate the right URL

### 6.7 Decision tree: do I need a new Meta App?

```
Is the new client's WABA already managed by your existing Meta Business?
├── YES
│   └── Use the SAME Meta App. Just add the new WABA + phone to it.
│       Pros: shared System User token, simpler webhook setup
│       Cons: one app gets reviewed/banned → all clients affected
│
└── NO  (client has their own Meta Business Manager)
    └── You'll need a new Meta App OR ask client to grant your app access.
        Recommended: have client add your app via Meta Business Settings →
        Partners. Then your app can manage their WABA. Single app, multi-tenant.
        Alternative: create a new app in their business manager. More isolation
        but more setup per client.
```

For your current setup (one Meta Business, several clients): **always use the same app**. Just remember to:
1. Subscribe each new WABA to the webhook (`/v22.0/{WABA_ID}/subscribed_apps`)
2. Register each new phone for Cloud API (`/v22.0/{PHONE_ID}/register`)

---

## 7. Multi-Tenant SaaS Path (Future)

If you ever want to onboard 10+ clients without per-client Vercel projects, here's the SaaS path. **Don't go down this road until you have at least 3-4 clients**, because clone-per-client is much simpler operationally.

### Core architecture
- ONE Vercel deployment
- ONE Supabase project (the agent's), with multi-tenant tables
- ONE codebase
- Each customer signs up via a self-service portal
- They paste their own Meta credentials, storefront URL, etc.

### Database changes
Add `tenant_id` to every table:
```sql
alter table conversations add column tenant_id uuid not null;
alter table messages add column tenant_id uuid not null;
alter table wa_cart_drafts add column tenant_id uuid not null;
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_name text,
  brand_color text,
  whatsapp_phone_number_id text not null,
  whatsapp_access_token text not null,    -- encrypted!
  whatsapp_verify_token text not null,
  storefront_url text not null,
  storefront_supabase_url text,
  storefront_supabase_key text,           -- encrypted!
  payment_provider text default 'moolre',
  created_at timestamptz default now()
);
create index idx_conv_tenant on conversations(tenant_id);
-- Add tenant scoping to RLS policies
```

### Routing changes
- Single webhook `/api/webhook/[tenantId]/route.ts`
- Each Meta app's webhook URL points to its own tenant's path
- Or detect tenant from the `Phone Number ID` in the payload

### Per-tenant configuration
- System prompt becomes a template with `{tenant.brand_name}` etc.
- Tool implementations look up tenant config first

### Security
- Encrypt access tokens at rest (we currently store them in env vars, plain)
- Never let tenant A see tenant B's data — RLS or app-layer enforcement

### Onboarding UI
- Customer-facing wizard: paste Meta credentials, paste Supabase credentials, configure brand
- Auto-subscribe their WABA via API
- Auto-set webhook URL via Meta API
- Auto-register their phone number

This is a 2-4 week build. Worth it once you're managing 5+ clients.

---

## 8. Future: Instagram Integration

Meta's Cloud API supports Instagram DMs with the same plumbing. Add it without a major rewrite:

### Prerequisites
- Client must have Instagram Business or Creator account (not personal)
- Linked to a Facebook Page
- That Page must be added to the same Meta App
- Permissions needed: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`, `pages_show_list`

### Code changes
1. **Webhook subscription** — subscribe Page to `messages`, `messaging_postbacks`
2. **Inbound parsing** — Instagram payloads use `entry[].messaging[]` (different shape from WhatsApp)
3. **Identity** — Instagram uses Page-Scoped User ID (PSID) instead of phone numbers; store as `channel: 'instagram'`, `channel_id: psid`
4. **Outbound send** — `POST /v22.0/{PAGE_ID}/messages` with PSID and message
5. **No interactive messages** on IG (yet) — products as image carousels work, but no buttons. Plain text + URL works.

### Limits
- IG DMs have a 7-day messaging window (vs WhatsApp's 24h)
- Standard messaging: respond to user-initiated messages within 24h free; outside window requires a Message Tag (HUMAN_AGENT, ACCOUNT_UPDATE, etc.)
- Rate limit: 100 calls/sec per page

### Cost
IG DMs are FREE within the 24h window. Outside the window, message tags are also free but use carefully.

---

## 9. Common Pitfalls & Fixes

### "Webhook verification failed"
- `WHATSAPP_VERIFY_TOKEN` env var doesn't match what you typed in Meta Configuration
- Redeploy Vercel after setting envs (envs aren't picked up live)

### "Inbound messages aren't reaching the webhook"
- Verify the WABA is subscribed: `GET /v22.0/{WABA_ID}/subscribed_apps`
- If empty, POST to subscribe
- Check Meta App → Webhooks → "Test" button works

### "Outbound messages return 'recipient not in allowed list'"
- You're using a test number AND haven't added the recipient to the 5-recipient whitelist
- Add via Meta App → WhatsApp → API Setup → "To" → Manage list

### "Outbound messages return 'access token expired'"
- You're using a temporary token (24h life). Generate a permanent System User token

### "Phone shows as not WhatsApp on customer's chat"
- Phone number not registered for Cloud API. Run `/register` POST with PIN
- Phone number not added to Cloud API yet — check WhatsApp Manager status

### "AI returns generic responses, doesn't search products"
- Check `OPENROUTER_API_KEY` is set
- Check `AI_MODEL` supports function calling (`gpt-4o-mini` does, `minimax-m2.5:free` doesn't)
- Check Vercel logs for `[ai] tool round 1` messages — if missing, model isn't being asked for tools

### "Searches return wrong products"
- Check the search debug: `DDZ_SEARCH_DEBUG=1` env, then look for `[DEBUG-SCORES]` in Vercel logs
- Tune scoring weights in `searchProducts` if needed
- Verify `pg_trgm` extension is enabled and indexes are built

### "Cart doesn't persist across messages"
- Check `wa_cart_drafts` table exists on AGENT Supabase
- Check the webhook is using the same phone number for `getCart` and `addToCart`

### "Checkout fails with 'invalid region'"
- The user typed a Ghanaian region not in the prompt's whitelist (the 16 regions)
- Update `GHANA_REGIONS` constant in `gsg-orders.ts` if needed

### "Webhook timing out at 60s"
- Likely too many tool rounds. Lower `MAX_TOOL_ROUNDS` in `ai.ts`
- Or AI model is slow — switch to `gpt-4o-mini`
- Or DB queries are slow — check Supabase Performance Advisor

### "First-contact welcome sent twice"
- Bug: `isFirstContact` not being reset properly. Check the `conversations` row was inserted (not just upserted)

---

## 10. Per-Client Onboarding Checklist

Print this and tick off as you go.

### Pre-flight
- [ ] Client signs the agreement
- [ ] Confirmed payment provider (Moolre / Paystack / Stripe / etc.)
- [ ] Confirmed storefront type (custom / Shopify / WooCommerce)
- [ ] Got DB credentials OR API key for storefront
- [ ] Got brand assets (name, logo, color, support phone, support email)
- [ ] Got the WhatsApp phone number to use

### Repo + hosting
- [ ] Created GitHub repo (`whatsapp-ai-{client}`)
- [ ] Cloned framework, renamed `ddz-*` → `{client}-*`
- [ ] Created Vercel project, linked repo
- [ ] Created Supabase project for the agent
- [ ] Applied agent schema (`supabase-schema.sql`)

### Client DB integration
- [ ] Got client's Supabase credentials (or set up alternative path)
- [ ] Applied additive migration ([§ 5](#5-applying-the-ddz-style-migration-to-a-new-client-db))
- [ ] Verified `find_user_by_whatsapp_phone` works for a real customer
- [ ] Verified `fuzzy_product_search` returns sensible results
- [ ] Adapted tools to client's product schema

### Client customization
- [ ] Updated env vars: branding, support contact
- [ ] Updated system prompt: store policies, checkout flow
- [ ] Updated `{client}-store-info.ts`: hours, delivery zones, payment methods
- [ ] Updated `{client}-orders.ts`: payment provider, storefront endpoint
- [ ] Removed unused tools (e.g. variants if N/A)
- [ ] Verified smoke tests pass: `npx tsx scripts/smoke-test-{client}.ts`

### Meta WhatsApp
- [ ] Phone number added to Meta Business Account
- [ ] Phone number verified
- [ ] Phone number registered for Cloud API (`/register` with PIN)
- [ ] Generated permanent access token (or reused existing)
- [ ] WABA subscribed to webhook (`/subscribed_apps` POST)
- [ ] Webhook callback URL set in Meta App
- [ ] Webhook verify token matches env
- [ ] Test recipient added (if test number)

### Vercel
- [ ] All env vars set in production
- [ ] Deployed to production
- [ ] Custom domain configured (optional)
- [ ] Logs accessible

### End-to-end test
- [ ] Sent test message → got reply
- [ ] Asked about a product → got product cards
- [ ] Tried a typo → fuzzy search worked
- [ ] Added to cart → cart card showed
- [ ] Started checkout → all fields collected naturally
- [ ] Completed checkout → got "Pay" button
- [ ] Paid (test mode) → order appeared in storefront DB
- [ ] Tracked the order → got correct status
- [ ] Sent first-contact from a fresh phone → welcome message arrived

### Handover
- [ ] Dashboard URL shared with client
- [ ] Dashboard auth set up (if applicable)
- [ ] Client trained on Agent ↔ Human mode toggle
- [ ] Documentation shared with client (this file + DOCUMENTATION.md)
- [ ] Support contact established

---

*Last updated: 2026-05-05*
