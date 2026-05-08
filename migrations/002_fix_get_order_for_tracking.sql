-- ============================================================================
-- Hotfix for public.get_order_for_tracking.
--
-- Bug: the inner `agg` CTE used `SELECT f.*` while `GROUP BY f.id, f.order_number,
-- f.status, ...` — `f.*` expands to ALL columns of orders (incl. user_id, etc.)
-- which aren't in the GROUP BY, so Postgres raises:
--   column "f.user_id" must appear in the GROUP BY clause or be used in an
--   aggregate function.
--
-- Fix: select only the columns we need downstream and group on those.
-- This is a CREATE OR REPLACE so it's idempotent and supersedes 001.
-- ============================================================================

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
    SELECT
      o.id,
      o.order_number,
      o.status::text         AS status,
      o.payment_status::text AS payment_status,
      o.total,
      o.currency,
      o.created_at,
      o.email,
      o.metadata
    FROM public.orders o
    WHERE o.order_number = v_term
       OR o.metadata->>'tracking_number' = v_term
    LIMIT 1
  ),
  agg AS (
    SELECT
      f.id,
      f.order_number,
      f.status,
      f.payment_status,
      f.total,
      f.currency,
      f.created_at,
      f.email,
      f.metadata,
      COALESCE(
        jsonb_agg(jsonb_build_object(
          'name',       oi.product_name,
          'variant',    oi.variant_name,
          'quantity',   oi.quantity,
          'unit_price', oi.unit_price,
          'image',      oi.metadata->>'image'
        )) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::jsonb
      ) AS items
    FROM found f
    LEFT JOIN public.order_items oi ON oi.order_id = f.id
    GROUP BY
      f.id, f.order_number, f.status, f.payment_status,
      f.total, f.currency, f.created_at, f.email, f.metadata
  )
  SELECT
    a.id,
    a.order_number,
    a.status,
    a.payment_status,
    a.total,
    a.currency,
    a.created_at,
    a.metadata->>'tracking_number'                 AS tracking_number,
    (LOWER(TRIM(a.email)) = v_mail)                AS email_match,
    true                                           AS exists_flag,
    a.items
  FROM agg a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_tracking(text, text)
  TO anon, authenticated, service_role;
