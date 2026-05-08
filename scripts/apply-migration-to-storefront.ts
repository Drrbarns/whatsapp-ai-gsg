// One-shot migration runner for the GSG storefront DB (vlflpclhtvuyxcdvlvkt).
//
// Reads the connection URL from $GSG_PG_URL or the first CLI arg, then executes
// migrations/001_gsg_storefront_wa_agent.sql against it. Each statement runs
// individually so trigram-index timeouts don't kill the whole batch.
//
// Usage:
//   GSG_PG_URL='postgresql://postgres:PASSWORD@db.vlflpclhtvuyxcdvlvkt.supabase.co:5432/postgres' \
//     npx tsx scripts/apply-migration-to-storefront.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const url = process.env.GSG_PG_URL || process.argv[2];
if (!url) {
  console.error(
    "Missing connection URL. Pass it as $GSG_PG_URL or first CLI argument."
  );
  process.exit(1);
}

const sqlPath = resolve(
  __dirname,
  "..",
  "migrations",
  "001_gsg_storefront_wa_agent.sql"
);
const raw = readFileSync(sqlPath, "utf8");

// Split on semicolons that are NOT inside a $$ ... $$ dollar-quoted block.
// (PL/pgSQL function bodies use $$ which contain semicolons.)
function splitStatements(src: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let inDollar = false;
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("$$", i)) {
      inDollar = !inDollar;
      buf += "$$";
      i += 2;
      continue;
    }
    const ch = src[i];
    if (ch === ";" && !inDollar) {
      const trimmed = buf.trim();
      if (trimmed && !isCommentOnly(trimmed)) stmts.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail && !isCommentOnly(tail)) stmts.push(tail);
  return stmts;
}

// True if the statement contains nothing but comments + whitespace.
// Strips "-- ..." line comments from the start of each line and checks
// whether anything is left. We keep the original buffer (with comments)
// in the executed SQL so error messages stay informative.
function isCommentOnly(stmt: string): boolean {
  const stripped = stmt
    .split("\n")
    .map((line) => line.replace(/^\s*--.*$/, ""))
    .join("\n")
    .trim();
  return stripped.length === 0;
}

async function main() {
  const stmts = splitStatements(raw);
  console.log(`Loaded ${stmts.length} statements from migration file.`);

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 90_000,
    query_timeout: 90_000,
  });
  await client.connect();
  console.log("Connected.");

  let ok = 0;
  let skipped = 0;
  for (let idx = 0; idx < stmts.length; idx++) {
    const s = stmts[idx];
    const preview = s
      .replace(/\s+/g, " ")
      .slice(0, 90);
    process.stdout.write(`[${idx + 1}/${stmts.length}] ${preview}... `);
    try {
      await client.query(s);
      console.log("ok");
      ok++;
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Treat "already exists" / "duplicate object" / "object exists" as fine
      if (
        /already exists/i.test(msg) ||
        /duplicate object/i.test(msg) ||
        /duplicate_object/i.test(msg)
      ) {
        console.log("skipped (already present)");
        skipped++;
      } else {
        console.log("FAILED");
        console.error(`  → ${msg}`);
        await client.end();
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log(
    `\nDone. ${ok} statements applied, ${skipped} skipped as already present.`
  );
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
