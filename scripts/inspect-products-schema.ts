// Quick inspection of the gsgshop products table — debugging why so many
// prices are GH₵0.00 in the WhatsApp agent.

import { Client } from "pg";

const url = process.env.GSG_PG_URL || process.argv[2];
if (!url) {
  console.error("Missing connection URL.");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();

  const totals = await c.query(`
    SELECT
      COUNT(*)::int                                         AS total,
      COUNT(*) FILTER (WHERE price IS NULL OR price = 0)::int AS zero_price,
      COUNT(*) FILTER (WHERE price > 0)::int                AS has_price,
      COUNT(*) FILTER (WHERE status = 'active')::int        AS active_total,
      COUNT(*) FILTER (WHERE status = 'active' AND (price IS NULL OR price = 0))::int AS active_zero_price
    FROM products;
  `);
  console.log("=== price distribution ===");
  console.dir(totals.rows[0]);

  const sampleZero = await c.query(`
    SELECT id, name, slug, price, status, metadata
    FROM products
    WHERE status = 'active' AND (price IS NULL OR price = 0)
    LIMIT 5;
  `);
  console.log("\n=== zero-priced active products (sample) ===");
  console.dir(sampleZero.rows, { depth: 4 });

  const sampleHasPrice = await c.query(`
    SELECT id, name, slug, price, status
    FROM products
    WHERE status = 'active' AND price > 0
    LIMIT 5;
  `);
  console.log("\n=== priced active products (sample) ===");
  console.dir(sampleHasPrice.rows);

  // Variants — maybe price is on the variant level?
  const variantPriced = await c.query(`
    SELECT
      COUNT(*)::int                                          AS total,
      COUNT(*) FILTER (WHERE price IS NULL OR price = 0)::int AS zero_price,
      COUNT(*) FILTER (WHERE price > 0)::int                 AS has_price
    FROM product_variants;
  `);
  console.log("\n=== variant price distribution ===");
  console.dir(variantPriced.rows[0]);

  // Specifically check if zero-priced products have priced variants
  const variantsForZeroProducts = await c.query(`
    SELECT p.id, p.name, p.price AS product_price,
           COUNT(v.id) FILTER (WHERE v.price > 0) AS variants_with_price,
           COUNT(v.id) AS total_variants,
           MIN(v.price) FILTER (WHERE v.price > 0) AS min_variant_price,
           MAX(v.price) FILTER (WHERE v.price > 0) AS max_variant_price
    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id
    WHERE p.status = 'active' AND (p.price IS NULL OR p.price = 0)
    GROUP BY p.id, p.name, p.price
    ORDER BY total_variants DESC
    LIMIT 8;
  `);
  console.log("\n=== variants for zero-priced products (sample) ===");
  console.dir(variantsForZeroProducts.rows);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
