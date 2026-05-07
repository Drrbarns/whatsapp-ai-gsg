/* eslint-disable no-console */
// Smoke test: exercises GSG tools end-to-end against the live database.
// Run with:  npx tsx scripts/smoke-test-gsg.ts
//
// READ-ONLY. Performs zero writes to GSG.

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env.local") });
import { resolveWhatsAppIdentity } from "../src/lib/gsg-identity";
import {
  searchProducts,
  getRecommendations,
  trackOrder,
} from "../src/lib/gsg-tools";

function header(s: string) {
  console.log("\n────────────────────────────────────────────");
  console.log("  " + s);
  console.log("────────────────────────────────────────────");
}

function pass(label: string, detail?: unknown) {
  console.log(`✅ ${label}` + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""));
}

function fail(label: string, detail?: unknown) {
  console.log(`❌ ${label}` + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""));
  process.exitCode = 1;
}

async function main() {
  header("GSG Smoke Test (READ-ONLY)");
  console.log(`URL: ${process.env.GSG_SUPABASE_URL}`);
  console.log(`Service-role key set: ${!!process.env.GSG_SUPABASE_SERVICE_ROLE_KEY}`);

  // ──────────────────────────────────────────────────────────
  header("Test 1 — Phone identity resolution (3 formats)");
  // ──────────────────────────────────────────────────────────
  // Real GSG customer: TrySammy Arthur, +233209636158
  const formats = ["233209636158", "+233209636158", "0209636158"];
  for (const fmt of formats) {
    const id = await resolveWhatsAppIdentity(fmt);
    if (id.isKnown && id.email === "admin@gsg.com") {
      pass(`format "${fmt}" → matched ${id.displayName} <${id.email}>`);
    } else {
      fail(`format "${fmt}" → no match`, id);
    }
  }

  // Test unknown number → should return isKnown=false but still normalize
  const unknown = await resolveWhatsAppIdentity("233000000000");
  if (!unknown.isKnown && unknown.normalized.intl === "+233000000000") {
    pass(`unknown number → isKnown=false, normalized intl="${unknown.normalized.intl}"`);
  } else {
    fail("unknown number test", unknown);
  }

  // ──────────────────────────────────────────────────────────
  header("Test 2 — search_products('rice') — GSG has 30+ rice SKUs");
  // ──────────────────────────────────────────────────────────
  const rice = await searchProducts("rice", 3);
  if (rice.length > 0) {
    pass(`returned ${rice.length} product(s)`);
    rice.forEach((p, i) =>
      console.log(`   ${i + 1}. ${p.name} — GH₵${p.price} (stock: ${p.quantity})`)
    );
  } else {
    fail("no rice products found");
  }

  // Quick fuzzy-search check (typo tolerance)
  const fuzzy = await searchProducts("ric", 3);
  if (fuzzy.length > 0) {
    pass(`typo "ric" returned ${fuzzy.length} product(s) (top: ${fuzzy[0].name.trim()})`);
  } else {
    fail("typo 'ric' returned 0 results — fuzzy search may not be wired up");
  }

  // ──────────────────────────────────────────────────────────
  header("Test 3 — search_products('') (empty query → empty result)");
  // ──────────────────────────────────────────────────────────
  const empty = await searchProducts("", 3);
  if (empty.length === 0) {
    pass("empty query correctly returned 0 results");
  } else {
    fail("empty query should return 0 results", { count: empty.length });
  }

  // ──────────────────────────────────────────────────────────
  header("Test 4 — get_recommendations() (no context → top-rated in stock)");
  // ──────────────────────────────────────────────────────────
  const recs = await getRecommendations();
  if (recs.length > 0) {
    pass(`returned ${recs.length} recommendation(s)`);
    recs.forEach((p, i) =>
      console.log(
        `   ${i + 1}. ${p.name} — GH₵${p.price} ⭐${p.rating ?? "n/a"} (${p.quantity} in stock)`
      )
    );
  } else {
    fail("no recommendations returned");
  }

  // ──────────────────────────────────────────────────────────
  header("Test 5 — track_order(real order + correct email)");
  // ──────────────────────────────────────────────────────────
  const realOrder = "ORD-1777715231504-863";
  const realEmail = "admin@gsg.com";
  const order = await trackOrder(realOrder, realEmail);
  if (order.status === "found") {
    pass(
      `order ${order.order.order_number} found — ${order.order.status}, GH₵${order.order.total}, ${order.order.items.length} item(s)`
    );
  } else {
    fail("track_order with correct credentials failed", order);
  }

  // ──────────────────────────────────────────────────────────
  header("Test 6 — track_order(real order + WRONG email) — PII guard");
  // ──────────────────────────────────────────────────────────
  const guarded = await trackOrder(realOrder, "wrong@example.com");
  if (guarded.status === "wrong_email") {
    pass(`PII guard works: wrong email → ${guarded.status}`);
  } else {
    fail("PII GUARD BROKEN: wrong email did not return wrong_email status!", guarded);
  }

  // ──────────────────────────────────────────────────────────
  header("Test 7 — track_order(fake order number)");
  // ──────────────────────────────────────────────────────────
  const fake = await trackOrder("ORD-FAKE-99999", "admin@gsg.com");
  if (fake.status === "not_found") {
    pass("non-existent order → not_found");
  } else {
    fail("fake order should return not_found", fake);
  }

  console.log("\n────────────────────────────────────────────");
  console.log(
    process.exitCode ? "  ❌ SOME TESTS FAILED" : "  ✅ ALL SMOKE TESTS PASSED"
  );
  console.log("────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
