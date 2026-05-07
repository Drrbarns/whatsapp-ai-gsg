/* eslint-disable no-console */
// End-to-end smoke test: spins up the dev server, simulates real WhatsApp
// inbound webhook payloads, and verifies AI + tools + persistence work.
//
// Usage:
//   npx tsx scripts/smoke-test-webhook.ts
//
// Env required: must be runnable AFTER `npm run dev` is up on :3000.
// The actual WhatsApp send WILL go to Meta — make sure your phone is in the
// allowed-recipients list during dev. Use --no-send to skip Meta calls.

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env.local") });

const WEBHOOK_URL =
  process.env.SMOKE_WEBHOOK_URL || "http://localhost:3000/api/webhook";
const TEST_PHONE = process.env.SMOKE_PHONE || "233535998837";

function header(s: string) {
  console.log("\n────────────────────────────────────────────");
  console.log("  " + s);
  console.log("────────────────────────────────────────────");
}

type ScenarioResult = {
  status: string;
  tools_called?: string[];
  hints_rendered?: string[];
  meta_error?: { code: number; message: string } | null;
};

function buildPayload(text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TEST_ENTRY",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "233000000000",
                phone_number_id: "TEST",
              },
              contacts: [
                { profile: { name: "Smoke Tester" }, wa_id: TEST_PHONE },
              ],
              messages: [
                {
                  from: TEST_PHONE,
                  id: `wamid.SMOKE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function runScenario(label: string, text: string): Promise<ScenarioResult> {
  console.log(`\n👤 USER: ${text}`);
  const t0 = Date.now();
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(text)),
  });
  const elapsed = Date.now() - t0;
  let json: ScenarioResult;
  try {
    json = (await res.json()) as ScenarioResult;
  } catch {
    json = { status: `non_json_${res.status}` };
  }
  console.log(
    `   ↳ ${res.status} (${elapsed}ms) status=${json.status} tools=[${json.tools_called?.join(",") || ""}] hints=[${json.hints_rendered?.join(",") || ""}]`
  );
  if (json.meta_error) {
    console.log(`   ⚠️  Meta error: ${json.meta_error.code} ${json.meta_error.message}`);
  }
  return json;
}

async function main() {
  header("GSG Webhook Smoke Test");
  console.log(`Webhook: ${WEBHOOK_URL}`);
  console.log(`Phone:   ${TEST_PHONE}`);
  console.log(
    "ℹ️  Each scenario actually sends a real WhatsApp message to your phone (if you are in Meta's allowed list)."
  );

  // Wait for dev server
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: "GET",
      });
      if (r.status === 403 || r.status === 200) {
        console.log("✅ Dev server responding");
        break;
      }
    } catch {
      /* not ready yet */
    }
    if (i === 0) console.log("⏳ Waiting for dev server on :3000…");
    await new Promise((r) => setTimeout(r, 1500));
    if (i === 19) {
      console.error("❌ Dev server not reachable. Run `npm run dev` first.");
      process.exit(1);
    }
  }

  // ─── Scenarios that exercise different tools
  header("Scenario 1 — Greeting / known-customer recognition");
  await runScenario("greeting", "Hey, what's up?");

  header("Scenario 2 — Product search");
  await runScenario("search", "do you have any cookware sets?");

  header("Scenario 3 — Recommendations");
  await runScenario("recs", "what's popular?");

  header("Scenario 4 — Add to cart by name");
  await runScenario(
    "add",
    "add the 13 pieces cookware set to my cart"
  );

  header("Scenario 5 — View cart");
  await runScenario("view", "what's in my cart?");

  header("Scenario 6 — Track an order");
  await runScenario(
    "track",
    "track my order ORD-1774743375810-901"
  );

  header("Scenario 7 — Store info");
  await runScenario("info", "do you deliver to Kumasi?");

  header("Scenario 8 — Clear cart");
  await runScenario("clear", "actually, clear my cart");

  console.log("\n────────────────────────────────────────────");
  console.log("  ✅ All scenarios sent. Check your WhatsApp + Vercel logs.");
  console.log("────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
