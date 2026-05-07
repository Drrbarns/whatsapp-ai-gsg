# Operations Runbook — WhatsApp AI Agent

> Day-2 operations: deploying changes, debugging live issues, managing Meta credentials, monitoring, common fixes. Read [DOCUMENTATION.md](./DOCUMENTATION.md) for architecture context.

---

## Table of Contents

1. [Deploying Changes](#1-deploying-changes)
2. [Live Debugging](#2-live-debugging)
3. [Meta WhatsApp Operations](#3-meta-whatsapp-operations)
4. [Database Operations](#4-database-operations)
5. [Common Issues + Fixes](#5-common-issues--fixes)
6. [Performance Tuning](#6-performance-tuning)
7. [Cost Monitoring](#7-cost-monitoring)
8. [Security Hygiene](#8-security-hygiene)
9. [Backup & Disaster Recovery](#9-backup--disaster-recovery)
10. [Useful API Calls (Copy-Paste Ready)](#10-useful-api-calls-copy-paste-ready)

---

## 1. Deploying Changes

### Standard deploy
```bash
git add -A
git commit -m "feat: ..."
git push origin main           # auto-deploys if GitHub is connected to Vercel
# OR explicitly:
vercel --prod
```

### Hot-fix without git
```bash
vercel --prod                  # deploys whatever's in the working directory
```

### Rollback to previous deployment
```bash
vercel ls                      # list recent deployments
vercel promote <deployment-url>   # make a previous one current
```

Or in dashboard: Deployments → ... → Promote to production.

### Update env vars
```bash
vercel env rm VAR_NAME production    # remove old value
vercel env add VAR_NAME production   # add new value (paste when prompted)
vercel --prod                        # redeploy to pick up envs (envs need a fresh build)
```

> Critical: env vars don't take effect until the NEXT deploy. Always redeploy after changing them.

---

## 2. Live Debugging

### Tail logs
```bash
vercel logs --follow
```

Or in dashboard: Deployments → click the current one → Logs tab.

### Key log markers (search/filter for these)
| Pattern | Meaning |
|---|---|
| `[webhook] new message from` | Inbound received |
| `[webhook] interactive postback id=` | Customer tapped a button |
| `[webhook] auto-reply OK` | AI reply sent successfully |
| `[ai] tool round X` | AI tool loop iteration |
| `[ai] selected tools:` | Which tools the model chose |
| `[ddz-tools] searchProducts(...) → N candidates` | Search execution |
| `[whatsapp] sent message to` | Outbound API success |
| `[whatsapp] error sending` | Outbound API failure |
| `Error: ` | Anything bad |

### Filter logs by request
```bash
vercel logs --follow | grep '<request-id>'
```

Each webhook invocation has a request ID in the first log line. Search for it to see all logs for that one message.

### Reproduce locally
```bash
npm run dev
ngrok http 3000
# Update Meta callback URL temporarily to ngrok URL
# Send test message — see logs in your terminal in real time
# Don't forget to restore Vercel URL when done
```

### Test specific tools without going through WhatsApp
```bash
npx tsx scripts/smoke-test-ddz.ts          # test DDZ tools
npx tsx scripts/smoke-test-webhook.ts      # full webhook simulation
```

---

## 3. Meta WhatsApp Operations

### Check phone number status
```bash
curl -s "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer {TOKEN}" | jq
```

Returns `verified_name`, `display_phone_number`, `quality_rating`, `messaging_limit_tier`, `code_verification_status`.

### Re-register a phone number for Cloud API
Use this when a phone shows "not on WhatsApp" or after adding a fresh number:
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/register" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```
Use a real 6-digit PIN. Save it — you need it again if the number ever de-registers.

### Subscribe a WABA to webhook events
Required after adding a NEW WABA to the app:
```bash
curl -X POST "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {TOKEN}"
```

### Verify webhook subscription
```bash
curl "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {TOKEN}"
```
Should return your app in the list.

### Send a test message via API
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "+233XXXXXXXXX",
    "type": "text",
    "text": { "body": "Test from API" }
  }'
```

If this works but the agent's outbound doesn't, the issue is in your code, not Meta.

### Generate a new System User access token
- Meta Business Suite → Business Settings → Users → System Users → "Generate New Token"
- Permissions: `whatsapp_business_messaging` + `whatsapp_business_management`
- Expiration: **Never expires**

Old tokens stay active for 60 days even after replacement, so you can do this without downtime.

### Check messaging quality + tier
```bash
curl -s "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}?fields=quality_rating,messaging_limit_tier" \
  -H "Authorization: Bearer {TOKEN}"
```

Tiers: `TIER_50` (testing) → `TIER_1K` (1K unique recipients/day) → `TIER_10K` → `TIER_100K` → `TIER_UNLIMITED`. Auto-promoted with good quality.

### Add or remove a test recipient (test number only)
- Meta App → WhatsApp → API Setup → "To" field → Manage list
- Add up to 5 numbers. Each must verify by entering a code sent to their WhatsApp.

---

## 4. Database Operations

### Connect to Supabase via SQL editor
- https://app.supabase.com → project → SQL Editor

### Apply a migration via MCP (if you have Supabase MCP set up)
Use `apply_migration` tool with name + SQL.

### Connect via psql
```bash
psql "postgres://postgres.[ref]:[password]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
```
Get the connection string from Supabase → Settings → Database → Connection string.

### Common queries

**Recent conversations:**
```sql
select c.phone, c.name, c.unread_count, c.mode, c.last_message_preview, c.updated_at
from conversations c
order by c.updated_at desc
limit 20;
```

**Recent messages for a phone:**
```sql
select m.role, m.content, m.media_type, m.status, m.created_at
from messages m
join conversations c on c.id = m.conversation_id
where c.phone = '+233XXXXXXXXX'
order by m.created_at desc
limit 20;
```

**Stuck typing indicators (cleanup):**
```sql
update conversations
   set is_typing = false
 where is_typing = true
   and updated_at < now() - interval '5 minutes';
```

**Delete a conversation (testing):**
```sql
delete from conversations where phone = '+233XXXXXXXXX';
-- messages cascade automatically
```

**See draft carts:**
```sql
select phone, jsonb_array_length(items) as item_count, updated_at
from wa_cart_drafts
order by updated_at desc;
```

**Find a customer (DDZ DB):**
```sql
select * from find_user_by_whatsapp_phone('+233XXXXXXXXX');
```

**Test fuzzy search (DDZ DB):**
```sql
select p.name, f.best_similarity
from fuzzy_product_search('stnaley cup', 5, 0.3) f
join products p on p.id = f.id
order by f.best_similarity desc;
```

---

## 5. Common Issues + Fixes

### Customer says "I'm not getting replies"
1. Check Vercel logs for their phone number — was the message received?
2. If yes but no reply: check for AI errors in logs
3. If no message received:
   - Check WABA subscription: `GET /v22.0/{WABA_ID}/subscribed_apps`
   - Check phone is registered: `GET /v22.0/{PHONE_NUMBER_ID}` → `verified_name` populated?
   - Check webhook URL is current in Meta App → Configuration

### "AI keeps re-asking for my email"
1. Check `find_user_by_whatsapp_phone('+233...')` returns the customer
2. If returns nothing: phone format mismatch in DB. Check the actual phone formats stored in DDZ:
   ```sql
   select distinct substring(phone, 1, 4) as prefix, count(*)
   from customers group by 1;
   ```
3. Update the RPC to handle the actual format

### "Search returns wrong products"
1. Enable debug logs: `vercel env add DDZ_SEARCH_DEBUG production` → `1`, redeploy
2. Send the failing query
3. Look for `[DEBUG-SCORES]` lines in logs to see actual scoring
4. Tune scoring weights in `searchProducts` if needed:
   - Bump fuzzy multiplier (currently 150) for more typo tolerance
   - Lower multi-token coverage threshold (currently 0.3) for more leniency

### "Stuck on first-contact welcome (sent twice)"
This means the conversations row is being inserted twice for the same phone. Check race condition in `upsertConversation`. The fix:
```typescript
const { data, error } = await supabase
  .from("conversations")
  .upsert({ phone, ... }, { onConflict: "phone" })
  .select()
  .single();
```

### "MoMo payment link expires before customer pays"
Moolre links typically last 30 minutes. Options:
1. Customer messages "send me the link again" → `start_checkout` re-runs
2. Implement a `regenerate_payment_link(order_number)` tool

### "Vercel function timing out at 60s"
The AI is taking too long. Diagnose:
1. Check `[ai] tool round X` logs — how many rounds?
2. If 4+ rounds: the AI is stuck looping. Lower `MAX_TOOL_ROUNDS` in `ai.ts`
3. If 1-2 rounds but slow: switch to a faster model (`gpt-4o-mini`)
4. If DB queries are slow: check Supabase Performance Advisor

### "Outbound message says 'phone not subscribed'"
The customer never opted in via your number. They must message you first to open the 24h service window. Or use a Marketing template message (paid).

### "Access token expired"
Even Never-expire tokens can be revoked if the System User is deleted. Generate a new one. Update `WHATSAPP_ACCESS_TOKEN` env. Redeploy.

### "Meta says my phone has poor quality rating"
- Quality drops if too many people block/report you
- Reduce send rate
- Send less spammy content
- Wait 7 days for the rating to reset

### "Realtime in dashboard not updating"
- Check Supabase → Database → Replication → make sure `messages` and `conversations` are in `supabase_realtime` publication
- Check browser console for WebSocket errors
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set correctly

---

## 6. Performance Tuning

### Reducing AI latency
- **Use streaming**: Currently we wait for full response. Streaming would let us send the typing indicator sooner. (Not implemented yet — would require chunked WhatsApp updates.)
- **Cap tool rounds**: `MAX_TOOL_ROUNDS = 4` in `ai.ts`. Lower if conversations bog down.
- **Smaller history**: We currently send last ~20 turns. Can drop to 10 for faster prompts.
- **Faster model**: `gpt-4o-mini` is already fast. `claude-3-haiku` is faster but no vision.

### Reducing DB query time
- Verify indexes: `select * from pg_indexes where tablename = 'products';`
- Use Supabase Performance Advisor for query suggestions
- For very large catalogs (>10K products): consider pre-computed search via Meilisearch or Typesense

### Reducing Meta API latency
- Use the closest Meta API endpoint (currently global)
- Batch reads where possible (e.g. media downloads)
- Don't `await` non-critical writes (use `waitUntil` from `@vercel/functions`)

### Caching
- Static store info: cache in module scope (reset per cold start)
- Recent customer identity: in-memory Map with 5-min TTL would help repeat customers
- Product images: served by Supabase CDN already

---

## 7. Cost Monitoring

### Vercel
- Dashboard → Usage → Overview
- Hobby tier: free until 100GB bandwidth + 100GB-hours functions
- Pro tier: $20 base + overage

### Supabase
- Dashboard → Reports → Usage
- Free tier: 500MB DB + 1GB storage + 2GB egress
- Pro tier: $25 base + $0.0125/GB DB / $0.021/GB storage / $0.09/GB egress

### OpenRouter
- Dashboard → Activity → see usage per request
- Set monthly spend alerts
- Average DDZ conversation: $0.001-$0.005 with gpt-4o-mini

### Meta WhatsApp
- Meta Business Suite → WhatsApp Manager → Insights → Conversations
- Free tier: 1,000 service conversations/month per phone
- Service convos = customer-initiated, free for 24h after their message

### Setting alerts
- **Vercel**: Settings → Notifications → Spend Limits
- **Supabase**: Settings → Billing → Alerts
- **OpenRouter**: Account → Limits → Spending alert
- **Meta**: WhatsApp Manager → Spending Limits per WABA

### Per-client cost rollup
Suggested monthly accounting columns:
- Meta charges (from Meta WhatsApp Manager export)
- OpenRouter charges (from per-client API key, or estimated by message volume)
- Supabase (if dedicated project)
- Allocated Vercel cost (split across clients on shared project)

---

## 8. Security Hygiene

### Secrets management
- **NEVER commit `.env.local`** — it's in `.gitignore`, keep it that way
- **NEVER paste service-role keys in chat or screenshots**
- Rotate access tokens annually (or when team changes)
- Treat the Meta access token like a password

### If a token leaks
1. Meta Business Suite → System Users → Revoke token immediately
2. Generate new token
3. Update Vercel env var, redeploy
4. Audit Vercel logs for suspicious outbound calls

### If Supabase service-role key leaks
1. Supabase → Settings → API → "Roll Service Role Key"
2. Update Vercel env, redeploy
3. Check `messages`/`conversations` tables for any unexpected inserts

### Webhook signature verification (recommended upgrade)
Currently we only check `WHATSAPP_VERIFY_TOKEN` on the GET (initial verification). Meta also signs every POST with HMAC-SHA256 using the App Secret. To add verification:

```typescript
import crypto from "node:crypto";

function verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

// In webhook POST handler:
const sig = request.headers.get("x-hub-signature-256");
const raw = await request.text();
if (!verifySignature(raw, sig, process.env.META_APP_SECRET!)) {
  return new Response("Forbidden", { status: 403 });
}
const body = JSON.parse(raw);
```

Add `META_APP_SECRET` to env (find in Meta App → Settings → Basic → App Secret).

### Customer PII
- Order tracking REQUIRES email match — never reveal email on file
- Don't log full message content in plaintext logs (or filter via Vercel log scrubbing)
- Don't store payment details (Moolre handles this)

### Dependency security
- `npm audit` — check for known vulnerabilities
- Keep `next`, `@supabase/supabase-js`, `openai` on latest patch versions
- Subscribe to GitHub Dependabot alerts on the repo

---

## 9. Backup & Disaster Recovery

### Agent Supabase
- Daily automated backups (Pro tier; Free tier is 7 days only)
- Manual backup before risky migrations:
  ```sql
  -- via psql
  pg_dump -h aws-0-xxx.pooler.supabase.com -U postgres -d postgres -t conversations -t messages -t wa_cart_drafts > backup.sql
  ```

### Client Supabase (DDZ)
- The client owns this — they should have their own backup strategy
- For our additive tables (`chat_conversations`, `ai_memory`, `support_knowledge_base`):
  ```sql
  pg_dump ... -t chat_conversations -t ai_memory -t support_knowledge_base > ddz_agent_data.sql
  ```

### Code
- GitHub is the source of truth
- Tag releases: `git tag v1.0.0 && git push --tags`

### Vercel
- Every deploy is preserved indefinitely (you can roll back to any)
- Env vars are NOT versioned — keep a copy in a secrets manager (1Password, etc.)

### What to do in a "site is down" emergency
1. **Vercel down**: rare, but check https://www.vercel-status.com — usually resolves in <1h
2. **Supabase down**: check https://status.supabase.com — RLS-enforced reads still work via direct postgres
3. **Meta API down**: rare, https://developers.facebook.com/status/dashboard/
4. **Our code broken**:
   - `vercel rollback` to previous deployment
   - Or `git revert HEAD && git push`
5. **All tokens revoked / locked out**: regenerate from Meta Business Manager (you should have admin access; if not, the original creator does)

---

## 10. Useful API Calls (Copy-Paste Ready)

Replace `{TOKEN}`, `{PHONE_NUMBER_ID}`, `{WABA_ID}`, `+233XXXXXXXXX` with your values.

### Meta WhatsApp

**Get phone number details:**
```bash
curl -s "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier,code_verification_status,name_status" \
  -H "Authorization: Bearer {TOKEN}" | jq
```

**Get all phone numbers under a WABA:**
```bash
curl -s "https://graph.facebook.com/v22.0/{WABA_ID}/phone_numbers" \
  -H "Authorization: Bearer {TOKEN}" | jq
```

**Get all WABAs you have access to:**
```bash
curl -s "https://graph.facebook.com/v22.0/me/businesses" \
  -H "Authorization: Bearer {TOKEN}" | jq
# Then for each business:
curl -s "https://graph.facebook.com/v22.0/{BUSINESS_ID}/owned_whatsapp_business_accounts" \
  -H "Authorization: Bearer {TOKEN}" | jq
```

**Register phone for Cloud API:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/register" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```

**Subscribe WABA to app webhook:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {TOKEN}"
```

**Check WABA subscriptions:**
```bash
curl -s "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {TOKEN}" | jq
```

**Send a text message:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "to":"+233XXXXXXXXX",
    "type":"text",
    "text":{"body":"Hello from API"}
  }'
```

**Send typing indicator:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "status":"read",
    "message_id":"wamid.XXX",
    "typing_indicator":{"type":"text"}
  }'
```

**Mark message as read:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","status":"read","message_id":"wamid.XXX"}'
```

**Send an interactive button message:**
```bash
curl -X POST "https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "to":"+233XXXXXXXXX",
    "type":"interactive",
    "interactive":{
      "type":"button",
      "body":{"text":"What would you like to do?"},
      "action":{
        "buttons":[
          {"type":"reply","reply":{"id":"option_1","title":"Option 1"}},
          {"type":"reply","reply":{"id":"option_2","title":"Option 2"}}
        ]
      }
    }
  }'
```

### Vercel CLI

```bash
vercel ls                        # list deployments
vercel inspect <url>             # detailed info
vercel logs --follow             # stream logs
vercel logs <url>                # logs for specific deployment
vercel env ls                    # list env vars
vercel env add NAME production   # add var
vercel env rm NAME production    # remove var
vercel env pull .env.local       # download all envs
vercel --prod                    # deploy to prod
vercel rollback                  # rollback to previous
vercel domains ls                # list custom domains
vercel domains add example.com   # add custom domain
```

### GitHub CLI

```bash
gh repo create owner/name --private --source=. --remote=origin
gh secret set NAME --body "value"     # for GitHub Actions
gh pr create --title "..." --body "..."
gh run watch                          # watch CI
```

### Supabase CLI

```bash
supabase projects list
supabase db reset                # reset local dev
supabase db diff                 # show schema diff
supabase functions deploy NAME   # deploy edge function (if used)
```

---

## Appendix — Daily / Weekly Ops Checklist

### Daily
- [ ] Glance at Vercel dashboard for any error spikes
- [ ] Check Meta WhatsApp Manager → quality rating still green
- [ ] Sample-test by sending a message to the bot

### Weekly
- [ ] Review Supabase storage usage (media bucket fills up)
- [ ] Check OpenRouter spending vs. budget
- [ ] Review any conversations flipped to "Human" mode and follow up

### Monthly
- [ ] Pull cost report (Meta + OpenRouter + Supabase + Vercel)
- [ ] Bill clients (if applicable)
- [ ] Update dependencies: `npm outdated`, then upgrade carefully
- [ ] Backup test: try restoring from latest Supabase snapshot

### Quarterly
- [ ] Rotate access tokens (Meta + Supabase service role)
- [ ] Review system prompt for staleness (new products, new policies)
- [ ] Audit Meta App permissions — remove anything unused
- [ ] Stress-test cost projections — are we still in the right pricing tier?

---

*Last updated: 2026-05-05*
