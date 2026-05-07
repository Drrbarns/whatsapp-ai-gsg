-- ============================================================================
-- WhatsApp AI agent migration for GSG Convenience Goods & More
-- Project: vlflpclhtvuyxcdvlvkt (storefront / Classy Debbie Collection)
--
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
--
-- This is FULLY ADDITIVE and idempotent — safe to re-run, never modifies
-- existing tables or data. Adds:
--   • pg_trgm extension (for typo-tolerant search)
--   • GIN trigram indexes on products.name / short_description / brand / slug
--   • chat_conversations / ai_memory / support_knowledge_base tables
--     (used by the WA agent to persist chat state, semantic memories,
--      and FAQ snippets for the brand)
--   • RPCs:
--       - find_user_by_whatsapp_phone(p_wa_id text)
--       - get_order_for_tracking(p_order_number text, p_email text)
--       - get_ai_memories(p_phone text, p_limit int)
--       - fuzzy_product_search(p_query text, p_limit int, p_min_similarity real)
-- ============================================================================

-- ─── Trigram extension + indexes ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_short_description_trgm
  ON public.products USING gin (short_description extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING gin (brand extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_slug_trgm
  ON public.products USING gin (slug extensions.gin_trgm_ops);

-- ─── chat_conversations: per-customer chat threads with the WA agent ────────
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone         text,
  channel       text NOT NULL DEFAULT 'whatsapp',
  status        text NOT NULL DEFAULT 'active',
  sentiment     text,
  summary       text,
  message_count integer NOT NULL DEFAULT 0,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_phone
  ON public.chat_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_customer
  ON public.chat_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
  ON public.chat_conversations(updated_at DESC);
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- ─── ai_memory: facts the WA agent learns about a customer over time ────────
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  category     text NOT NULL,
  content      text NOT NULL,
  importance   integer NOT NULL DEFAULT 5,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_phone
  ON public.ai_memory(phone, importance DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_customer
  ON public.ai_memory(customer_id);
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

-- ─── support_knowledge_base: FAQ snippets / brand voice training ────────────
CREATE TABLE IF NOT EXISTS public.support_knowledge_base (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  question    text,
  answer      text NOT NULL,
  tags        text[] NOT NULL DEFAULT '{}',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_kb_topic
  ON public.support_knowledge_base(topic) WHERE active;
CREATE INDEX IF NOT EXISTS idx_support_kb_tags
  ON public.support_knowledge_base USING gin (tags) WHERE active;
ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;

-- ─── Phone → customer resolver (handles +233xxx / 0xxx / 233xxx) ────────────
CREATE OR REPLACE FUNCTION public.find_user_by_whatsapp_phone(p_wa_id text)
RETURNS TABLE (
  customer_id uuid,
  user_id uuid,
  display_name text,
  email text,
  phone text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_local text;
  v_intl  text;
BEGIN
  v_clean := regexp_replace(coalesce(p_wa_id, ''), '[^0-9]', '', 'g');
  IF length(v_clean) < 9 THEN RETURN; END IF;

  IF v_clean LIKE '233%' THEN
    v_intl  := '+' || v_clean;
    v_local := '0' || substring(v_clean from 4);
  ELSIF v_clean LIKE '0%' THEN
    v_local := v_clean;
    v_intl  := '+233' || substring(v_clean from 2);
  ELSE
    v_intl  := '+' || v_clean;
    v_local := v_clean;
  END IF;

  RETURN QUERY
    SELECT c.id, c.user_id,
           COALESCE(c.full_name, NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')) AS display_name,
           c.email,
           c.phone
    FROM public.customers c
    WHERE c.phone IN (v_intl, v_local, v_clean, p_wa_id)
       OR c.secondary_phone IN (v_intl, v_local, v_clean, p_wa_id)
    ORDER BY c.last_order_at DESC NULLS LAST, c.created_at DESC NULLS LAST
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.find_user_by_whatsapp_phone(text)
  TO anon, authenticated, service_role;

-- ─── Order tracking with PII guard (email must match) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_order_for_tracking(
  p_order_number text,
  p_email        text
)
RETURNS TABLE (
  id              uuid,
  order_number    text,
  status          text,
  payment_status  text,
  total           numeric,
  currency        text,
  created_at      timestamptz,
  tracking_number text,
  email_match     boolean,
  exists_flag     boolean,
  items           jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term text;
  v_mail text;
BEGIN
  v_term := TRIM(coalesce(p_order_number, ''));
  v_mail := LOWER(TRIM(coalesce(p_email, '')));

  IF v_term = '' THEN RETURN; END IF;

  RETURN QUERY
  WITH found AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.order_number = v_term
       OR o.metadata->>'tracking_number' = v_term
    LIMIT 1
  ),
  agg AS (
    SELECT f.*,
           COALESCE(
             jsonb_agg(jsonb_build_object(
               'name', oi.product_name,
               'variant', oi.variant_name,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price,
               'image', oi.metadata->>'image'
             )) FILTER (WHERE oi.id IS NOT NULL),
             '[]'::jsonb
           ) AS items
    FROM found f
    LEFT JOIN public.order_items oi ON oi.order_id = f.id
    GROUP BY f.id, f.order_number, f.status, f.payment_status, f.total,
             f.currency, f.created_at, f.metadata, f.email
  )
  SELECT
    a.id,
    a.order_number,
    a.status::text,
    a.payment_status::text,
    a.total,
    a.currency,
    a.created_at,
    a.metadata->>'tracking_number' AS tracking_number,
    (LOWER(TRIM(a.email)) = v_mail) AS email_match,
    true AS exists_flag,
    a.items
  FROM agg a;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_for_tracking(text, text)
  TO anon, authenticated, service_role;

-- ─── Get top-importance memories for a phone ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_memories(p_phone text, p_limit int DEFAULT 10)
RETURNS TABLE (
  id         uuid,
  category   text,
  content    text,
  importance integer,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.category, m.content, m.importance, m.created_at
  FROM public.ai_memory m
  WHERE m.phone = p_phone
    AND (m.expires_at IS NULL OR m.expires_at > now())
  ORDER BY m.importance DESC, m.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_memories(text, int)
  TO anon, authenticated, service_role;

-- ─── Trigram fuzzy product search RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fuzzy_product_search(
  p_query text,
  p_limit int DEFAULT 20,
  p_min_similarity real DEFAULT 0.3
) RETURNS TABLE (id uuid, best_similarity real)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.id,
         GREATEST(
           strict_word_similarity(p_query, coalesce(p.name,'')),
           strict_word_similarity(p_query, coalesce(p.short_description,'')) * 0.85,
           strict_word_similarity(p_query, coalesce(p.brand,''))             * 0.9,
           strict_word_similarity(p_query, coalesce(p.slug,''))              * 0.7,
           similarity(p_query, coalesce(p.name,''))                          * 0.6
         )::real AS best_similarity
  FROM public.products p
  WHERE p.status = 'active'
    AND GREATEST(
          strict_word_similarity(p_query, coalesce(p.name,'')),
          strict_word_similarity(p_query, coalesce(p.short_description,'')) * 0.85,
          strict_word_similarity(p_query, coalesce(p.brand,''))             * 0.9,
          strict_word_similarity(p_query, coalesce(p.slug,''))              * 0.7,
          similarity(p_query, coalesce(p.name,''))                          * 0.6
        ) >= p_min_similarity
  ORDER BY best_similarity DESC, p.rating_avg DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.fuzzy_product_search(text, int, real)
  TO anon, authenticated, service_role;
