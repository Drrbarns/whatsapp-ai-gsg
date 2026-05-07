# WhatsApp AI Sales Agent

A production WhatsApp AI agent with a faithful WhatsApp-Web-style dashboard. Customers chat naturally on WhatsApp; the AI searches the live product catalog (with typo tolerance), shows interactive product cards, manages a per-customer cart, walks through a guided checkout, generates Mobile Money payment links, and tracks orders — all in plain shop-attendant language.

Currently powering Discount Discovery Zone (DDZ). Designed to be cloned for new clients (see [CLONING_GUIDE.md](./CLONING_GUIDE.md)).

## Documentation

| Doc | Read when |
|---|---|
| [DOCUMENTATION.md](./DOCUMENTATION.md) | You're new to the codebase. Full architecture, every file explained, every design decision. |
| [CLONING_GUIDE.md](./CLONING_GUIDE.md) | You're deploying this for a new client. Step-by-step playbook + per-client onboarding checklist. |
| [OPERATIONS.md](./OPERATIONS.md) | The bot is live and you need to debug, deploy a fix, rotate tokens, or check costs. |

## What it does

- Replies to customers on WhatsApp in natural shop-attendant language
- Searches the live catalog with typo tolerance ("stnaley cup" → Stanley cup)
- Sends rich product cards with images, prices, "Add to cart" / "Choose options" buttons
- Manages per-customer cart and walks through the full checkout flow
- Creates real orders on the storefront and generates Mobile Money payment links
- Tracks orders by number/tracking code with email verification
- Recognizes returning customers, greets by name, remembers facts across conversations
- Voice notes (recorded → transcoded → analyzed by GPT-4o-mini)
- Provides a WhatsApp-Web-style dashboard for monitoring + human takeover

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **AI:** OpenRouter (`openai/gpt-4o-mini` by default — vision + tool calling)
- **Database:** Supabase (Postgres + Realtime + Storage). Two projects: ours for chat state, client's for products/orders.
- **Search:** Postgres `pg_trgm` for typo-tolerant fuzzy search + custom relevance scoring
- **WhatsApp:** Meta Cloud API v22 (text, media, interactive messages, typing indicator)
- **Payments:** Moolre (Mobile Money) — extensible to Paystack/Stripe/etc.
- **Audio:** `ffmpeg-static` for voice-note transcoding
- **Hosting:** Vercel

The dashboard is a faithful rebuild of WhatsApp Web's dark UI: tailed bubbles, double-tick read receipts, the iconic doodle background, voice notes with waveform playback, image lightbox, file/document attachments, sticker support, an AI-typing indicator, and per-conversation Agent / Human mode.

## Features

- **WhatsApp Web look-and-feel** — sidebar with avatars, search, filter pills (All / Unread / AI / Human), unread badges, time formatting; chat header with mode toggle and call icons; doodle SVG chat background; bubble tails; date separators; status-tick footer (queued / sent / delivered / read / failed).
- **Voice notes** — in-browser `MediaRecorder` capture with live waveform timer, preview-before-send, then server-side ffmpeg transcode to `audio/ogg;codecs=opus` (the only format Meta accepts for voice messages).
- **Images, video, documents, stickers** — paperclip menu with WhatsApp-style colored icons, full-screen pre-send preview with caption, image lightbox with download, native video player, file bubbles with size + extension, naked sticker rendering.
- **AI auto-replies with vision** — inbound text or image messages are forwarded to OpenRouter using the multimodal `image_url` content schema. Vision-capable model required (`openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `google/gemini-pro-1.5`, etc.).
- **Live typing indicator** — webhook flips `conversations.is_typing` while the AI is generating, surfacing as bouncing dots in the chat header, "AI is typing…" in the sidebar preview, and a real outgoing-bubble typing indicator at the bottom of the message list, all over Supabase Realtime.
- **Agent ↔ Human mode** — toggle per-conversation; in Human mode the bot stays quiet and you reply from the dashboard.
- **Inbound media is persisted** — webhook downloads media from Meta's short-lived URL, stores it in the Supabase `media` bucket, and references the public URL on the message row so the dashboard never breaks when Meta's URL expires.

## Architecture

```
WhatsApp customer
       │ message (text / image / voice / doc)
       ▼
Meta Cloud API ──webhook──▶ POST /api/webhook
                                │
                                ├─ persist message in Supabase (downloads media → Supabase Storage)
                                ├─ flip conversations.is_typing = true
                                ├─ getAIResponse() via OpenRouter (with image_url parts for vision)
                                ├─ sendWhatsAppMessage() with reply
                                └─ flip is_typing = false

Dashboard (Next.js client) ──Supabase Realtime──▶ live updates
                          ──REST───────────────▶ /api/conversations, /send, /send-media
```

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Database:** Supabase (Postgres + Realtime + Storage)
- **AI:** OpenRouter (OpenAI-compatible, multimodal)
- **WhatsApp:** Meta Cloud API v22
- **Audio:** `ffmpeg-static` for voice-note transcoding
- **UI:** Tailwind v4

## Getting Started

### 1. Install dependencies

```
npm install
```

### 2. Copy and fill the env file

```
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business → System Users → Generate Token (`whatsapp_business_messaging`, `whatsapp_business_management`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Any string; reuse it in Meta → WhatsApp → Configuration → Verify Token |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `AI_MODEL` | e.g. `openai/gpt-4o-mini` (vision-capable) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (treat as a secret) |

### 3. Apply the database migrations

Either run `supabase-schema.sql` in the Supabase SQL Editor, or use the Supabase MCP / CLI to apply the migrations one by one. The schema creates `conversations` and `messages` tables, indexes, RLS policies (anon read so Realtime works, service-role writes from the server), enables the `supabase_realtime` publication, and creates a public `media` storage bucket (50 MB).

### 4. Start dev server

```
npm run dev
```

### 5. Expose the webhook to Meta

```
ngrok http 3000
```

Configure Meta App → WhatsApp → Configuration:
- Callback URL: `https://<your-ngrok>.ngrok-free.app/api/webhook`
- Verify Token: same as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to `messages` field

### 6. Send a message

Send any text / photo / voice note from your WhatsApp to your test number. The dashboard updates in real time and the AI replies (unless mode is Human).

## API Routes

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/webhook` | Meta verification challenge |
| `POST` | `/api/webhook` | Inbound messages + status events |
| `GET`  | `/api/conversations` | List with last-message preview & type |
| `PATCH`| `/api/conversations/[id]` | Toggle `mode`, `markRead`, `unread_count` |
| `GET`  | `/api/conversations/[id]/messages` | Full chat history |
| `POST` | `/api/conversations/[id]/send` | Send a text reply from the dashboard |
| `POST` | `/api/conversations/[id]/send-media` | Multipart upload — image / voice / video / document / sticker |

## Project Layout

```
src/
├─ app/
│  ├─ api/                 Webhook + REST routes
│  ├─ globals.css          WhatsApp dark palette + doodle background + animations
│  ├─ layout.tsx
│  └─ page.tsx             Composition of Sidebar + ChatHeader + MessageList + Composer
├─ components/             WhatsApp UI primitives (Sidebar, MessageBubble, AudioPlayer, VoiceRecorder, AttachmentMenu, EmojiPicker, ImageLightbox, ChatHeader, ...)
└─ lib/
   ├─ ai.ts                OpenRouter (multimodal) wrapper
   ├─ audio.ts             ffmpeg-static transcode → ogg/opus
   ├─ format.tsx           time/duration/bytes/initials helpers + linkify
   ├─ storage.ts           Supabase Storage helpers
   ├─ supabase.ts          admin / server / browser clients
   ├─ types.ts             hand-maintained domain types
   ├─ database.types.ts    auto-generated from Supabase schema
   └─ whatsapp.ts          Cloud API: text + media + read receipts
```

## Caveats

- **Voice notes from the dashboard** are recorded as `audio/webm` or `audio/mp4` in the browser and transcoded server-side to `audio/ogg;codecs=opus` (Meta's only supported format for voice messages).
- **Vision** only works with vision-capable models. If you set `AI_MODEL=minimax/minimax-m2.5:free`, image content is silently ignored.
- **Webhook latency**: the AI call blocks the webhook so the typing indicator works. If your model is slow, Meta will retry after 5 s — consider moving the AI call into a background job (Vercel `waitUntil`, Supabase Edge Function, etc.).
- **DDZ-specific code** lives in `src/lib/ddz-*.ts`. When cloning to a new client, rename these to `{client}-*.ts`. See [CLONING_GUIDE.md § 3.7](./CLONING_GUIDE.md#37-rename-the-ddz-prefixed-files).

## Need to do something specific?

| Task | Doc |
|---|---|
| Understand how the AI search works | [DOCUMENTATION.md § 10](./DOCUMENTATION.md#10-search-engine--including-typo-tolerance) |
| Set up a new client | [CLONING_GUIDE.md § 3](./CLONING_GUIDE.md#3-step-by-step-setup) |
| Configure Meta WhatsApp | [DOCUMENTATION.md § 16](./DOCUMENTATION.md#16-meta-whatsapp-cloud-api--full-setup) |
| Debug a production issue | [OPERATIONS.md § 5](./OPERATIONS.md#5-common-issues--fixes) |
| Add Instagram support | [CLONING_GUIDE.md § 8](./CLONING_GUIDE.md#8-future-instagram-integration) |
| Move toward multi-tenant SaaS | [CLONING_GUIDE.md § 7](./CLONING_GUIDE.md#7-multi-tenant-saas-path-future) |
| Cost a client | [DOCUMENTATION.md § 18](./DOCUMENTATION.md#18-costs-limits--pricing) |

## License

MIT
