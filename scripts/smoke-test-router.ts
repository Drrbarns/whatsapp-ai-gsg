// Quick local smoke test for the multi-context router.
// Verifies that messages route to the right context, and that brand intent
// detection picks the right business unit. No DB / network required.

import { detectIntent, BUSINESS_UNITS } from "../src/contexts/brand/knowledge";
import { routeMessage } from "../src/lib/intent-router";

const cases: { msg: string; activeContext: "goods" | "escrow" | "brand"; isFirstContact: boolean; expectContext: "goods" | "escrow" | "brand" }[] = [
  // Explicit commands
  { msg: "menu", activeContext: "goods", isFirstContact: false, expectContext: "brand" },
  { msg: "shop", activeContext: "brand", isFirstContact: false, expectContext: "goods" },
  { msg: "escrow", activeContext: "brand", isFirstContact: false, expectContext: "escrow" },
  { msg: "back", activeContext: "goods", isFirstContact: false, expectContext: "brand" },

  // Intent — goods
  { msg: "do you have rice", activeContext: "brand", isFirstContact: false, expectContext: "goods" },
  { msg: "I need cooking oil", activeContext: "brand", isFirstContact: false, expectContext: "goods" },

  // Intent — escrow
  { msg: "I was scammed on Instagram", activeContext: "brand", isFirstContact: false, expectContext: "escrow" },
  { msg: "what's the status of SBS-12345", activeContext: "brand", isFirstContact: false, expectContext: "escrow" },
  { msg: "I want to open a dispute", activeContext: "brand", isFirstContact: false, expectContext: "escrow" },

  // Intent — link-only units (personal_shopper, courier, street_cuisine, affiliates) → brand
  { msg: "I want to send a courier package to Kumasi", activeContext: "brand", isFirstContact: false, expectContext: "brand" },
  { msg: "I want jollof for lunch", activeContext: "brand", isFirstContact: false, expectContext: "brand" },
  { msg: "I want to be an affiliate partner", activeContext: "brand", isFirstContact: false, expectContext: "brand" },

  // Sticky
  { msg: "and one more thing", activeContext: "goods", isFirstContact: false, expectContext: "goods" },
  { msg: "and?", activeContext: "escrow", isFirstContact: false, expectContext: "escrow" },

  // First contact
  { msg: "hi", activeContext: "brand", isFirstContact: true, expectContext: "brand" },
  { msg: "good morning", activeContext: "brand", isFirstContact: true, expectContext: "brand" },
];

let passes = 0;
let failures = 0;

console.log("\n────────── ROUTER SMOKE TESTS ──────────\n");
for (const c of cases) {
  const r = routeMessage({
    message: c.msg,
    activeContext: c.activeContext,
    isFirstContact: c.isFirstContact,
  });
  const ok = r.context === c.expectContext;
  const tag = ok ? "✅" : "❌";
  console.log(
    `${tag} "${c.msg}" (was=${c.activeContext}, first=${c.isFirstContact}) → ${r.context} [${r.reason}]`
  );
  if (ok) passes++;
  else failures++;
}

console.log("\n────────── BRAND INTENT DETECTION ──────────\n");
const intents: { msg: string; expectKey: string }[] = [
  { msg: "I want to buy soap", expectKey: "goods" },
  { msg: "open a dispute", expectKey: "escrow" },
  { msg: "send a parcel", expectKey: "courier" },
  { msg: "I want jollof rice for delivery", expectKey: "street_cuisine" },
  { msg: "I want a personal shopper to go to Makola", expectKey: "personal_shopper" },
  { msg: "how do I become an affiliate", expectKey: "affiliates" },
  { msg: "what's the weather", expectKey: "" }, // no match
];

for (const c of intents) {
  const u = detectIntent(c.msg);
  const got = u?.key ?? "";
  const ok = got === c.expectKey;
  console.log(`${ok ? "✅" : "❌"} "${c.msg}" → ${got || "(none)"} (expected ${c.expectKey || "(none)"})`);
  if (ok) passes++;
  else failures++;
}

console.log("\n────────── SUMMARY ──────────");
console.log(`${passes} passed, ${failures} failed of ${passes + failures}`);
console.log(`${BUSINESS_UNITS.length} business units configured`);
process.exit(failures > 0 ? 1 : 0);
