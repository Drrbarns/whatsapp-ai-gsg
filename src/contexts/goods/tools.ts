// ============================================================================
// GSG AI tools — port of standardecom's chat-tools, adapted for GSG schema.
//
// PHASE 1: Read-only tools only. Writes (orders, support tickets) come later.
//
// Each tool returns plain objects ready to be:
//   1. Stringified back to the LLM as tool-result content
//   2. Translated into WhatsApp Interactive Messages by the webhook layer
// ============================================================================

import { gsgAdminDb } from "./db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GSGProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  image: string | null;
  quantity: number;
  inStock: boolean;
  brand: string | null;
  rating: number | null;
  hasVariants: boolean;
  /** Short marketing line for WhatsApp captions */
  caption: string;
};

export type GSGOrderItem = {
  name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  image: string | null;
};

export type GSGOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  items: GSGOrderItem[];
};

// ─── Internal helpers ───────────────────────────────────────────────────────

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  compare_at_price: number | string | null;
  quantity: number;
  brand: string | null;
  rating_avg: number | string | null;
  description?: string | null;
  short_description?: string | null;
  tags?: string[] | null;
  metadata: Record<string, unknown> | null;
  product_images: { url: string; position: number }[] | null;
  product_variants?: { id: string }[] | null;
};

function mapProduct(p: RawProduct): GSGProduct {
  const sortedImages = [...(p.product_images ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  const image = sortedImages[0]?.url ?? null;
  const price = Number(p.price);
  const compareAt = p.compare_at_price != null ? Number(p.compare_at_price) : null;
  const rating = p.rating_avg != null ? Number(p.rating_avg) : null;
  const hasVariants = (p.product_variants?.length ?? 0) > 0;
  const inStock = (p.quantity ?? 0) > 0;
  const discountStr =
    compareAt && compareAt > price
      ? ` (was GH₵${compareAt.toFixed(2)})`
      : "";
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price,
    compare_at_price: compareAt,
    image,
    quantity: p.quantity ?? 0,
    inStock,
    brand: p.brand,
    rating,
    hasVariants,
    caption: `*${p.name}*\nGH₵${price.toFixed(2)}${discountStr}${
      inStock ? "" : " — out of stock"
    }`,
  };
}

// ============================================================================
// Tool 1: search_products
// ============================================================================

// Words to ignore when tokenizing a search query — they add noise but no
// signal (so "do you have any bags" → just "bags" → also "bag").
// Includes common SMS/Pidgin abbreviations Ghanaian customers might use.
const STOPWORDS = new Set([
  // Common English stopwords
  "a", "an", "the", "of", "for", "in", "on", "with", "to", "and", "or",
  "do", "you", "have", "any", "got", "some", "get", "me", "i", "want",
  "need", "like", "show", "find", "please", "what", "whats", "is", "are",
  "by", "from", "this", "that", "those", "these", "looking", "about",
  "your", "yours", "we", "us", "our", "can", "will", "would", "could",
  "there", "here", "if", "be", "been", "was", "were", "may", "might",
  // Common SMS/Pidgin abbreviations
  "wat", "wht", "wats", "u", "ur", "n", "y", "abt", "abet", "pls", "plz",
  "thx", "thks", "ok", "okay", "hw", "hi", "hey", "yo", "sup", "dey",
  "hav", "haf", "lk", "wnt", "gimme", "give", "send", "wanna", "gonna",
  "lookin", "lookng", "looking", "searching", "search", "buy", "buying",
  "purchase", "order", "ordering", "much", "cost", "price", "cheap",
]);

/**
 * Turn a free-form query like "do you have any adult bags?" into a set of
 * terms to OR-match across the catalog. Handles plural ↔ singular so
 * "bags" finds "Beach Bag" and "fridges" finds "fridge".
 */
function generateSearchTerms(query: string): string[] {
  const cleaned = (query || "").toLowerCase().trim();
  if (!cleaned) return [];

  const terms = new Set<string>();
  // Always include the full phrase as one shot for exact matches like "yoga mat"
  terms.add(cleaned);

  const tokens = cleaned
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  for (const t of tokens) {
    terms.add(t);

    // Plural → singular (covers most English nouns)
    if (t.endsWith("ies") && t.length > 4) {
      terms.add(t.slice(0, -3) + "y"); // bunnies → bunny
    } else if (t.endsWith("es") && t.length > 4) {
      terms.add(t.slice(0, -2)); // dishes → dish, boxes → box
      terms.add(t.slice(0, -1)); // dishes → dishe (catches some edge cases)
    } else if (t.endsWith("s") && t.length > 3) {
      terms.add(t.slice(0, -1)); // bags → bag
    }

    // Singular → plural too (so "bag" also matches "bags")
    if (!t.endsWith("s") && t.length >= 3) {
      terms.add(t + "s");
    }
  }

  return Array.from(terms);
}

/**
 * Score a candidate product by how well it matches the user's intent.
 * Higher is better. We weight by field (name/slug > description > tags)
 * and reward multi-token coverage so "Stanley cup" beats "Milk Glass Cup".
 */
function scoreProduct(
  p: RawProduct,
  fullPhrase: string,
  meaningfulTokens: string[],
  matchedCategoryIds: Set<string> | null
): number {
  const name = (p.name || "").toLowerCase();
  const slug = (p.slug || "").toLowerCase();
  const brand = (p.brand || "").toLowerCase();
  const desc = (p.description || "").toLowerCase();
  const shortDesc = (p.short_description || "").toLowerCase();
  const tags = (p.tags || []).map((t) => (t || "").toLowerCase());
  const phrase = fullPhrase.toLowerCase();

  let score = 0;

  // Massive bonus for exact phrase match in the most important fields
  if (phrase && name.includes(phrase)) score += 200;
  else if (phrase && slug.includes(phrase.replace(/\s+/g, "-"))) score += 150;
  else if (phrase && shortDesc.includes(phrase)) score += 80;
  else if (phrase && desc.includes(phrase)) score += 60;

  // Per-token field-weighted scoring. Multi-token coverage is rewarded
  // because we sum across all matching tokens.
  let nameMatchedTokens = 0;
  let anyMatchedTokens = 0;
  for (const t of meaningfulTokens) {
    if (!t) continue;
    let tokenHit = false;

    // Whole-word match in name is the strongest signal — e.g. "stanley"
    // as a standalone word in "Stanley Replica" not just substring noise.
    const wholeWord = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
    if (wholeWord.test(name)) {
      score += 50;
      nameMatchedTokens++;
      tokenHit = true;
    } else if (name.includes(t)) {
      score += 25;
      nameMatchedTokens++;
      tokenHit = true;
    }

    if (slug.includes(t)) {
      score += 15;
      tokenHit = true;
    }
    if (brand.includes(t)) {
      score += 12;
      tokenHit = true;
    }
    if (shortDesc.includes(t)) {
      score += 8;
      tokenHit = true;
    }
    if (desc.includes(t)) {
      score += 4;
      tokenHit = true;
    }
    if (tags.some((tag) => tag.includes(t))) {
      score += 6;
      tokenHit = true;
    }
    if (tokenHit) anyMatchedTokens++;
  }

  // Bonus for matching ALL tokens — keeps "Stanley cup" matches above
  // products that only match "cup".
  if (meaningfulTokens.length > 1 && nameMatchedTokens === meaningfulTokens.length) {
    score += 100;
  }

  // Category match (e.g. "bags" matched the "Bags and Accessories" category)
  if (matchedCategoryIds && matchedCategoryIds.size > 0) {
    // p doesn't include category_id in its selected fields by default,
    // but our query SELECT includes it in this rewrite, see below.
    const catId = (p as RawProduct & { category_id?: string | null }).category_id;
    if (catId && matchedCategoryIds.has(catId)) score += 20;
  }

  // Tiny tiebreakers
  if ((p.quantity ?? 0) > 0) score += 1; // in-stock nudge
  if (p.rating_avg) score += Math.min(2, Number(p.rating_avg) / 3); // up to +2 for 5-star

  return score;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchProducts(
  query: string,
  limit = 5
): Promise<GSGProduct[]> {
  const rawTerm = (query || "").trim();
  if (!rawTerm) return [];

  const allTerms = generateSearchTerms(rawTerm);
  if (allTerms.length === 0) return [];

  // Tokens we treat as the customer's "real intent" for scoring (skip the
  // full multi-word phrase, that's used separately for exact-phrase boost).
  const meaningfulTokens = Array.from(
    new Set(
      allTerms.filter(
        (t) => t.length >= 2 && !t.includes(" ") // single-word terms only
      )
    )
  );

  // The customer's CANONICAL tokens — exactly the words they typed, after
  // stripping stopwords. We use this (not the pluralised meaningfulTokens)
  // for the multi-token coverage check, otherwise "stnaley cup" would need
  // to cover both "stnaley" AND "stnaleys" AND "cup" AND "cups" to qualify.
  const userTokens = Array.from(
    new Set(
      rawTerm
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    )
  );

  const db = gsgAdminDb();

  // ── Step 1: find any matching category ids ────────────────────────────
  const catOrParts: string[] = [];
  for (const t of allTerms) {
    const safe = t.replace(/[%_,()]/g, (c) => `\\${c}`);
    catOrParts.push(`name.ilike.%${safe}%`);
    catOrParts.push(`slug.ilike.%${safe}%`);
  }
  const { data: catRows } = await db
    .from("categories")
    .select("id")
    .or(catOrParts.join(","));
  const categoryIds = new Set((catRows ?? []).map((r: { id: string }) => r.id));

  // ── Step 2: pull a wide candidate set via OR across all searchable fields
  const prodOrParts: string[] = [];
  for (const t of allTerms) {
    const safe = t.replace(/[%_,()]/g, (c) => `\\${c}`);
    prodOrParts.push(`name.ilike.%${safe}%`);
    prodOrParts.push(`description.ilike.%${safe}%`);
    prodOrParts.push(`short_description.ilike.%${safe}%`);
    prodOrParts.push(`slug.ilike.%${safe}%`);
    prodOrParts.push(`brand.ilike.%${safe}%`);
  }
  if (categoryIds.size > 0) {
    prodOrParts.push(`category_id.in.(${Array.from(categoryIds).join(",")})`);
  }

  const SELECT = `id, name, slug, price, compare_at_price, quantity, brand, category_id,
       rating_avg, description, short_description, tags, metadata,
       product_images(url, position),
       product_variants(id)`;

  // ── Step 2a: GUARANTEED candidates — for multi-token queries, fetch
  // products whose name matches the FULL phrase OR ALL meaningful tokens.
  // This ensures "Kids Bag" never gets crowded out by "Kids perfume" when
  // the customer asked for "kids bag".
  const guaranteed: RawProduct[] = [];
  if (meaningfulTokens.length >= 1) {
    const phraseSafe = rawTerm.toLowerCase().replace(/[%_,()]/g, (c) => `\\${c}`);
    // 2a.i — exact phrase in name (e.g. "stanley cup")
    const { data: phraseMatches } = await db
      .from("products")
      .select(SELECT)
      .eq("status", "active")
      .ilike("name", `%${phraseSafe}%`)
      .limit(20);
    guaranteed.push(...((phraseMatches ?? []) as RawProduct[]));

    // 2a.ii — for multi-token queries, all tokens present in name (in any order)
    if (meaningfulTokens.length >= 2) {
      let q2 = db.from("products").select(SELECT).eq("status", "active");
      for (const t of meaningfulTokens) {
        const safe = t.replace(/[%_,()]/g, (c) => `\\${c}`);
        q2 = q2.ilike("name", `%${safe}%`);
      }
      const { data: allTokensMatch } = await q2.limit(20);
      guaranteed.push(...((allTokensMatch ?? []) as RawProduct[]));
    }
  }

  // ── Step 2b: BROAD candidates via OR across all searchable fields ─────
  const { data, error } = await db
    .from("products")
    .select(SELECT)
    .eq("status", "active")
    .or(prodOrParts.join(","))
    .limit(150);

  if (error) {
    console.error("[gsg-tools] searchProducts error:", error.message, {
      rawTerm,
      allTerms,
    });
  }

  // ── Step 2c: FUZZY candidates via pg_trgm RPC — handles typos like
  // "stnaley cup" → "stanley cup", "stanly" → "stanley", "blnder" → "blender".
  // The RPC uses strict_word_similarity which scores against the BEST WORD
  // in the product name, not the whole string — that's why short typos work.
  //
  // Smart filtering: we only run per-token fuzzy on tokens that have NO
  // literal matches in the broad pool. Otherwise common words like "cup"
  // would get fuzzy-boosted everywhere.
  const broadPoolText = ((data ?? []) as RawProduct[])
    .map((p) =>
      `${p.name ?? ""} ${p.short_description ?? ""} ${p.description ?? ""} ${
        p.brand ?? ""
      } ${p.slug ?? ""}`.toLowerCase()
    )
    .join(" || ");

  // Best fuzzy similarity per (productId, token) — used so that fuzzy
  // matches on a typo'd token can count toward multi-token coverage.
  // E.g. for query "stnaley cup", "stnaley" fuzzy-matches the word
  // "Stanley" in "Stanley cup (40 oz)", so we count BOTH tokens as
  // covered → product gets the all-tokens-in-name bonus.
  const fuzzyScoreById = new Map<string, number>();
  const fuzzyByTokenById = new Map<string, Map<string, number>>();

  if (rawTerm.length >= 3) {
    try {
      const fuzzyQueries = new Map<string, "phrase" | string>(); // query → role
      fuzzyQueries.set(rawTerm, "phrase");
      for (const t of meaningfulTokens) {
        if (t.length < 3) continue;
        if (broadPoolText.includes(t)) continue; // common token, skip
        fuzzyQueries.set(t, t);
      }

      const queryList = Array.from(fuzzyQueries.entries());
      const allFuzzyResults = await Promise.all(
        queryList.map(([q]) =>
          db.rpc("fuzzy_product_search", {
            p_query: q,
            p_limit: 15,
            p_min_similarity: 0.3,
          })
        )
      );

      queryList.forEach(([, role], idx) => {
        const rows = (allFuzzyResults[idx]?.data ?? []) as Array<{
          id: string;
          best_similarity: number;
        }>;
        rows.forEach((r) => {
          const sim = Number(r.best_similarity);
          const prev = fuzzyScoreById.get(r.id) ?? 0;
          fuzzyScoreById.set(r.id, Math.max(prev, sim));
          if (role !== "phrase") {
            // role is the token name itself
            let m = fuzzyByTokenById.get(r.id);
            if (!m) {
              m = new Map();
              fuzzyByTokenById.set(r.id, m);
            }
            m.set(role, Math.max(m.get(role) ?? 0, sim));
          }
        });
      });
      const fuzzyIds = Array.from(fuzzyScoreById.keys());
      // Hydrate any fuzzy products NOT already covered by guaranteed/broad
      const knownIds = new Set([
        ...guaranteed.map((p) => p.id),
        ...((data ?? []) as RawProduct[]).map((p) => p.id),
      ]);
      const newFuzzyIds = fuzzyIds.filter((id) => !knownIds.has(id));
      if (newFuzzyIds.length > 0) {
        const { data: extras } = await db
          .from("products")
          .select(SELECT)
          .in("id", newFuzzyIds);
        if (extras) {
          (extras as RawProduct[]).forEach((p) => guaranteed.push(p));
        }
      }
    } catch (err) {
      // pg_trgm may not be enabled on legacy environments — log and continue.
      console.warn("[gsg-tools] fuzzy_product_search unavailable:", err);
    }
  }

  // ── Step 3: dedupe (guaranteed first wins) and re-rank by relevance ───
  const seen = new Set<string>();
  const candidates: RawProduct[] = [];
  for (const p of [...guaranteed, ...((data ?? []) as RawProduct[])]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      candidates.push(p);
    }
  }
  const scored = candidates
    .map((p) => {
      let score = scoreProduct(p, rawTerm, meaningfulTokens, categoryIds);

      // Per-product fuzzy bonus from trigram similarity. Typo'd match
      // (~0.5 similarity → +75) can beat a generic single-token match.
      const fuzzy = fuzzyScoreById.get(p.id);
      if (fuzzy && fuzzy > 0) score += Math.round(fuzzy * 150);

      // CRITICAL: count fuzzy-matched tokens toward multi-token coverage.
      // For "stnaley cup", "stnaley" doesn't literally match "Stanley" but
      // fuzzy-matches it strongly. We award the multi-token bonus to
      // products where every userToken has either a literal OR a
      // strong-enough fuzzy match in the name.
      if (userTokens.length >= 2) {
        const tokenFuzzy = fuzzyByTokenById.get(p.id);
        const name = (p.name || "").toLowerCase();
        let coveredTokens = 0;
        for (const t of userTokens) {
          const wholeWord = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
          if (wholeWord.test(name) || name.includes(t)) {
            coveredTokens++;
            continue;
          }
          // Also accept the de-pluralised form (typed "bags", name has "bag")
          const singular = t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : null;
          if (singular && new RegExp(`\\b${escapeRegex(singular)}\\b`, "i").test(name)) {
            coveredTokens++;
            continue;
          }
          const tokFuzzy = tokenFuzzy?.get(t) ?? 0;
          if (tokFuzzy >= 0.3) coveredTokens++;
        }
        if (coveredTokens === userTokens.length) {
          score += 120; // strong bonus — beats category match (+20)
        }
      }

      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: in-stock first, then higher quantity, then name
      const aInStock = (a.p.quantity ?? 0) > 0 ? 1 : 0;
      const bInStock = (b.p.quantity ?? 0) > 0 ? 1 : 0;
      if (aInStock !== bInStock) return bInStock - aInStock;
      if ((b.p.quantity ?? 0) !== (a.p.quantity ?? 0))
        return (b.p.quantity ?? 0) - (a.p.quantity ?? 0);
      return a.p.name.localeCompare(b.p.name);
    });

  if (process.env.GSG_SEARCH_DEBUG === "1") {
    console.log(
      "[DEBUG-SCORES]",
      scored
        .slice(0, 15)
        .map((x) => `${x.p.name.trim()}=${x.score}`)
        .join(" || ")
    );
  }
  const top = scored.slice(0, Math.max(limit, 1)).map((x) => x.p);

  console.log(
    `[gsg-tools] searchProducts("${rawTerm}") → ${candidates.length} candidates, ${scored.length} matched, top ${top.length}: [${top.map((p) => p.name).join(" | ")}]`
  );

  return top.map((p) => mapProduct(p));
}

// ============================================================================
// Tool 2: get_recommendations
// ============================================================================

export async function getRecommendations(
  context?: string,
  limit = 4
): Promise<GSGProduct[]> {
  const db = gsgAdminDb();
  let query = db
    .from("products")
    .select(
      `id, name, slug, price, compare_at_price, quantity, brand,
       rating_avg, metadata,
       product_images(url, position),
       product_variants(id)`
    )
    .eq("status", "active")
    .gt("quantity", 0);

  const term = context?.trim();
  if (term) {
    const terms = generateSearchTerms(term);
    if (terms.length > 0) {
      // Match category ids too
      const catOrParts: string[] = [];
      for (const t of terms) {
        const safe = t.replace(/[%_,()]/g, (c) => `\\${c}`);
        catOrParts.push(`name.ilike.%${safe}%`);
        catOrParts.push(`slug.ilike.%${safe}%`);
      }
      const { data: catRows } = await db
        .from("categories")
        .select("id")
        .or(catOrParts.join(","));
      const categoryIds = (catRows ?? []).map((r: { id: string }) => r.id);

      const orParts: string[] = [];
      for (const t of terms) {
        const safe = t.replace(/[%_,()]/g, (c) => `\\${c}`);
        orParts.push(`name.ilike.%${safe}%`);
        orParts.push(`description.ilike.%${safe}%`);
        orParts.push(`short_description.ilike.%${safe}%`);
        orParts.push(`slug.ilike.%${safe}%`);
        orParts.push(`brand.ilike.%${safe}%`);
      }
      if (categoryIds.length > 0) {
        orParts.push(`category_id.in.(${categoryIds.join(",")})`);
      }
      query = query.or(orParts.join(","));
    }
  }

  const { data, error } = await query
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("[gsg-tools] getRecommendations error:", error.message);
    return [];
  }
  return (data ?? []).map((p) => mapProduct(p as RawProduct));
}

// ============================================================================
// Tool 3: track_order
//
// Uses the get_order_for_tracking RPC which enforces email-match for PII safety.
// Accepts both order_number (ORD-...) and ANY tracking number stored in
// metadata.tracking_number (GSG uses prefixes like SLI-, GSG-, TRK- etc).
//
// Returns a tagged status so the LLM can give the right message:
//   - found:        order + email match → return full order
//   - wrong_email:  order exists but email doesn't match (security guard hit)
//   - not_found:    no order with that number/tracking exists
//   - missing_email: caller didn't provide an email at all
// ============================================================================

export type GSGOrderLookup =
  | { status: "found"; order: GSGOrder }
  | { status: "wrong_email"; orderNumberOnFile: string }
  | { status: "not_found" }
  | { status: "missing_email" };

export async function trackOrder(
  orderNumber: string,
  email: string
): Promise<GSGOrderLookup> {
  const term = (orderNumber || "").trim();
  const mail = (email || "").trim();
  if (!term) return { status: "not_found" };
  if (!mail) return { status: "missing_email" };

  const db = gsgAdminDb();

  // The RPC returns a TABLE — 0 rows when the order doesn't exist, otherwise
  // 1 row with email_match/exists_flag flags so we can branch without doing
  // a second "does this exist?" query.
  const { data, error } = await db.rpc("get_order_for_tracking", {
    p_order_number: term,
    p_email: mail,
  });

  if (error) {
    console.error("[gsg-tools] trackOrder RPC error:", error.message);
    return { status: "not_found" };
  }

  type Row = {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    total: number | string | null;
    currency: string | null;
    created_at: string;
    tracking_number: string | null;
    email_match: boolean;
    exists_flag: boolean;
    items: Array<{
      name: string;
      variant: string | null;
      quantity: number;
      unit_price: number | string;
      image: string | null;
    }> | null;
  };

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as Row) : null;

  // No row at all → order doesn't exist (RPC didn't find it by order_number
  // or by metadata.tracking_number).
  if (!row || !row.exists_flag) {
    return { status: "not_found" };
  }

  // Order exists but the supplied email doesn't match — PII guard.
  if (!row.email_match) {
    return { status: "wrong_email", orderNumberOnFile: row.order_number };
  }

  return {
    status: "found",
    order: {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      payment_status: row.payment_status,
      total: Number(row.total ?? 0),
      currency: row.currency ?? "GHS",
      created_at: row.created_at,
      tracking_number: row.tracking_number,
      items: (row.items ?? []).map((i) => ({
        name: i.name,
        variant: i.variant,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        image: i.image ?? null,
      })),
    },
  };
}

// ============================================================================
// Tool 3.5: get_product_variants — list selectable variants for a product
//
// GSG products can have up to 3 option dimensions (size, color, etc).
// We dedupe duplicates and skip "Default"-only variants since those are
// effectively no-choice.
// ============================================================================

export type GSGVariant = {
  id: string;
  /** Display label e.g. "Large", "Orange", "Black / 32GB" */
  label: string;
  price: number;
  quantity: number;
  inStock: boolean;
  image: string | null;
};

type RawVariant = {
  id: string;
  name: string | null;
  price: number | string | null;
  quantity: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  image_url: string | null;
};

function buildVariantLabel(v: RawVariant): string {
  const opts = [v.option1, v.option2, v.option3]
    .map((o) => (o ?? "").trim())
    .filter((o) => o && o.toLowerCase() !== "default");
  // Dedupe options (handles "Black/Black" pattern)
  const unique = Array.from(new Set(opts));
  if (unique.length > 0) return unique.join(" / ");
  // Fall back to variant.name unless that's also "Default"/empty
  const n = (v.name ?? "").trim();
  if (n && n.toLowerCase() !== "default") return n;
  return "Standard";
}

/**
 * Fetch up to 10 distinct variants for a product. Returns:
 *  - variants:        deduped, customer-presentable list (in-stock first)
 *  - hasRealChoice:   true only if there's >1 unique label OR a non-default label
 *
 * If hasRealChoice is false, the caller should just add the product as-is
 * (the LLM will skip the "choose options" step).
 */
export async function getProductVariants(
  productId: string
): Promise<{ product: GSGProduct; variants: GSGVariant[]; hasRealChoice: boolean } | null> {
  const term = (productId || "").trim();
  if (!term) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    term
  );

  const db = gsgAdminDb();

  // Resolve product (by id or slug) so we can return a card alongside.
  const baseQ = db
    .from("products")
    .select(
      `id, name, slug, price, compare_at_price, quantity, brand,
       rating_avg, metadata,
       product_images(url, position),
       product_variants(id)`
    )
    .eq("status", "active");

  const { data: prodData } = await (isUuid
    ? baseQ.eq("id", term).maybeSingle()
    : baseQ.eq("slug", term).maybeSingle());

  if (!prodData) return null;
  const product = mapProduct(prodData as RawProduct);

  // Fetch all variants for that product
  const { data: rawVariants, error } = await db
    .from("product_variants")
    .select("id, name, price, quantity, option1, option2, option3, image_url")
    .eq("product_id", product.id);

  if (error) {
    console.error("[gsg-tools] getProductVariants error:", error.message);
    return { product, variants: [], hasRealChoice: false };
  }

  // Dedupe by (label + price), keeping the variant_id with highest stock.
  const groups = new Map<
    string,
    { winner: RawVariant; totalQty: number; label: string }
  >();
  for (const v of (rawVariants ?? []) as RawVariant[]) {
    const label = buildVariantLabel(v);
    const price = Number(v.price ?? product.price);
    const key = `${label}|${price}`;
    const qty = v.quantity ?? 0;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { winner: v, totalQty: qty, label });
    } else {
      existing.totalQty += qty;
      if (qty > (existing.winner.quantity ?? 0)) existing.winner = v;
    }
  }

  // Build the deduped list
  let variants: GSGVariant[] = Array.from(groups.values()).map((g) => ({
    id: g.winner.id,
    label: g.label,
    price: Number(g.winner.price ?? product.price),
    quantity: g.totalQty,
    inStock: g.totalQty > 0,
    image: g.winner.image_url ?? null,
  }));

  // Sort: in-stock first, then by label
  variants.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  // Cap at 10 (WhatsApp List max rows)
  variants = variants.slice(0, 10);

  // "Real choice" means the customer actually has something meaningful to pick.
  const hasRealChoice =
    variants.length > 1 ||
    (variants.length === 1 &&
      variants[0].label !== "Standard" &&
      variants[0].label.toLowerCase() !== "default");

  return { product, variants, hasRealChoice };
}

// ============================================================================
// Tool 4: get_product_for_cart — fetch one product by id-or-slug for cart preview
// ============================================================================

export async function getProductForCart(
  idOrSlug: string
): Promise<GSGProduct | null> {
  const term = (idOrSlug || "").trim();
  if (!term) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    term
  );

  const db = gsgAdminDb();
  const baseQ = db
    .from("products")
    .select(
      `id, name, slug, price, compare_at_price, quantity, brand,
       rating_avg, metadata,
       product_images(url, position),
       product_variants(id)`
    )
    .eq("status", "active");

  const { data, error } = await (isUuid
    ? baseQ.eq("id", term).maybeSingle()
    : baseQ.eq("slug", term).maybeSingle());

  if (error || !data) return null;
  return mapProduct(data as RawProduct);
}

// ============================================================================
// Tool 5: get_customer_orders — order history for a logged-in GSG user
// ============================================================================

export type GSGOrderSummary = {
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  item_count: number;
};

export async function getCustomerOrders(
  emailOrUserId: { email?: string; userId?: string },
  limit = 5
): Promise<GSGOrderSummary[]> {
  if (!emailOrUserId.email && !emailOrUserId.userId) return [];

  const db = gsgAdminDb();
  let query = db
    .from("orders")
    .select(
      `order_number, status, payment_status, total, created_at,
       order_items(id)`
    );

  if (emailOrUserId.userId) {
    query = query.eq("user_id", emailOrUserId.userId);
  } else if (emailOrUserId.email) {
    query = query.eq("email", emailOrUserId.email.toLowerCase());
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[gsg-tools] getCustomerOrders error:", error.message);
    return [];
  }

  return (data ?? []).map(
    (o: {
      order_number: string;
      status: string;
      payment_status: string;
      total: number | string;
      created_at: string;
      order_items: { id: string }[] | null;
    }) => ({
      order_number: o.order_number,
      status: o.status,
      payment_status: o.payment_status,
      total: Number(o.total),
      created_at: o.created_at,
      item_count: o.order_items?.length ?? 0,
    })
  );
}

// ============================================================================
// Tool 6: get_customer_profile — name, lifetime stats for known customer
// ============================================================================

export type GSGCustomerProfile = {
  name: string | null;
  email: string;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
};

export async function getCustomerProfileByEmail(
  email: string
): Promise<GSGCustomerProfile | null> {
  if (!email?.trim()) return null;

  const db = gsgAdminDb();

  const { data: customer } = await db
    .from("customers")
    .select("full_name, email")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!customer) return null;

  // Aggregate from orders since GSG customers table doesn't have stats columns we know of
  const { data: orderStats } = await db
    .from("orders")
    .select("total, created_at")
    .eq("email", email.toLowerCase())
    .eq("payment_status", "paid");

  const totalOrders = orderStats?.length ?? 0;
  const totalSpent =
    orderStats?.reduce((s, o) => s + Number(o.total ?? 0), 0) ?? 0;
  const lastOrderAt =
    orderStats?.length
      ? orderStats
          .map((o) => o.created_at)
          .sort()
          .reverse()[0]
      : null;

  return {
    name: customer.full_name,
    email: customer.email,
    total_orders: totalOrders,
    total_spent: totalSpent,
    last_order_at: lastOrderAt,
  };
}

// ============================================================================
// Tool 7: check_coupon — validate a coupon code
// ============================================================================

export type GSGCoupon = {
  valid: boolean;
  code: string;
  reason?: string;
  type?: string;
  value?: number;
  minimum_purchase?: number;
  maximum_discount?: number;
  expires?: string;
};

export async function checkCoupon(
  code: string,
  cartTotal?: number
): Promise<GSGCoupon> {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) return { valid: false, code: trimmed, reason: "No code provided." };

  const db = gsgAdminDb();
  const { data, error } = await db
    .from("coupons")
    .select("*")
    .eq("code", trimmed)
    .maybeSingle();

  if (error || !data) {
    return {
      valid: false,
      code: trimmed,
      reason: "This coupon code does not exist.",
    };
  }

  const now = new Date();
  const c = data as {
    is_active: boolean;
    start_date: string | null;
    end_date: string | null;
    usage_limit: number | null;
    usage_count: number | null;
    minimum_purchase: number | string | null;
    maximum_discount: number | string | null;
    type: string | null;
    value: number | string | null;
  };

  if (!c.is_active)
    return { valid: false, code: trimmed, reason: "This coupon is no longer active." };
  if (c.start_date && new Date(c.start_date) > now)
    return { valid: false, code: trimmed, reason: "This coupon is not yet valid." };
  if (c.end_date && new Date(c.end_date) < now)
    return { valid: false, code: trimmed, reason: "This coupon has expired." };
  if (c.usage_limit && (c.usage_count ?? 0) >= c.usage_limit)
    return { valid: false, code: trimmed, reason: "This coupon has reached its usage limit." };

  const minPurchase = c.minimum_purchase != null ? Number(c.minimum_purchase) : null;
  if (cartTotal !== undefined && minPurchase && cartTotal < minPurchase) {
    return {
      valid: false,
      code: trimmed,
      reason: `Minimum purchase of GH₵${minPurchase.toFixed(2)} required.`,
    };
  }

  return {
    valid: true,
    code: trimmed,
    type: c.type ?? undefined,
    value: c.value != null ? Number(c.value) : undefined,
    minimum_purchase: minPurchase ?? undefined,
    maximum_discount:
      c.maximum_discount != null ? Number(c.maximum_discount) : undefined,
    expires: c.end_date ?? undefined,
  };
}
