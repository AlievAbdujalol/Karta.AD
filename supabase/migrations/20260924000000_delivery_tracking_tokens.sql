-- ============================================================
-- Delivery tracking tokens (public /track/:token) — Phase B
-- Spec: KARTA_AD_DELIVERY_SPEC.md §15, §47
-- - delivery_tracking_tokens: trk_ token per order, 7-day expiry
-- - get_delivery_tracking(token): public safe JSON (no PII)
-- - ensure_tracking_token(order_id): service_role mint (Edge Function)
-- - backfill: one active token for every existing order
-- Applied: 2026-09-24
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- §15 tracking tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT ('trk_' || encode(gen_random_bytes(24), 'hex')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_tracking_tokens_order
  ON delivery_tracking_tokens(order_id);

-- At most one live (non-revoked) token per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_tracking_tokens_active_order
  ON delivery_tracking_tokens(order_id)
  WHERE revoked_at IS NULL;

-- ============================================================
-- Auto-mint token on new order insert
-- ============================================================
CREATE OR REPLACE FUNCTION delivery_create_tracking_token()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO delivery_tracking_tokens (order_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_delivery_tracking_token ON delivery_orders;
CREATE TRIGGER trg_delivery_tracking_token
AFTER INSERT ON delivery_orders
FOR EACH ROW
EXECUTE FUNCTION delivery_create_tracking_token();

-- ============================================================
-- Backfill: one active token per existing order that lacks one
-- ============================================================
INSERT INTO delivery_tracking_tokens (order_id)
SELECT o.id
FROM delivery_orders o
WHERE NOT EXISTS (
  SELECT 1
  FROM delivery_tracking_tokens t
  WHERE t.order_id = o.id
    AND t.revoked_at IS NULL
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ensure_tracking_token — Edge Function / service_role only
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_tracking_token(p_order_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT token INTO v_token
  FROM delivery_tracking_tokens
  WHERE order_id = p_order_id
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  -- Free the partial unique slot (expired but not yet revoked)
  UPDATE delivery_tracking_tokens
  SET revoked_at = now()
  WHERE order_id = p_order_id
    AND revoked_at IS NULL;

  INSERT INTO delivery_tracking_tokens (order_id)
  VALUES (p_order_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION ensure_tracking_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_tracking_token(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_tracking_token(UUID) TO service_role;

-- ============================================================
-- §47 get_delivery_tracking — public safe payload (no PII)
-- Returns found=false for unknown / expired / revoked tokens
-- (indistinguishable — no existence oracle)
-- ============================================================
CREATE OR REPLACE FUNCTION get_delivery_tracking(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_token delivery_tracking_tokens%ROWTYPE;
  v_order delivery_orders%ROWTYPE;
  v_courier_first_name TEXT;
  v_courier_rating NUMERIC;
  v_courier_lat DOUBLE PRECISION;
  v_courier_lng DOUBLE PRECISION;
  v_courier_status TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT * INTO v_token
  FROM delivery_tracking_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT * INTO v_order
  FROM delivery_orders
  WHERE id = v_token.order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  IF v_order.courier_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(split_part(p.full_name, ' ', 1), ''), 'Курьер'),
      dc.rating,
      dc.lat,
      dc.lng,
      dc.status
    INTO
      v_courier_first_name,
      v_courier_rating,
      v_courier_lat,
      v_courier_lng,
      v_courier_status
    FROM profiles p
    LEFT JOIN delivery_couriers dc ON dc.user_id = p.id
    WHERE p.id = v_order.courier_id;
  END IF;

  RETURN json_build_object(
    'found', true,
    'public_id', v_order.public_id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'pickup_address', v_order.pickup_address,
    'dropoff_address', v_order.dropoff_address,
    'pickup_lat', v_order.pickup_lat,
    'pickup_lng', v_order.pickup_lng,
    'dropoff_lat', v_order.dropoff_lat,
    'dropoff_lng', v_order.dropoff_lng,
    'eta_min', v_order.eta_min,
    'distance_km', v_order.distance_km,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'expires_at', v_token.expires_at,
    'courier',
      CASE
        WHEN v_order.courier_id IS NULL THEN NULL
        ELSE json_build_object(
          'first_name', v_courier_first_name,
          'rating', v_courier_rating,
          'lat', v_courier_lat,
          'lng', v_courier_lng,
          'status', v_courier_status
        )
      END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION get_delivery_tracking(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_delivery_tracking(TEXT) TO anon, authenticated;

-- ============================================================
-- RLS — table only managed via RPC; admin policy for direct access
-- ============================================================
ALTER TABLE delivery_tracking_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Admins manage delivery tracking tokens"
    ON delivery_tracking_tokens FOR ALL
    USING (EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
