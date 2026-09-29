-- ============================================================
-- Karta-AD Delivery Phase A — dual-run schema foundation
-- Spec: KARTA_AD_DELIVERY_SPEC.md §7, §16–20, §21, §24, §42
-- - merchants / merchant_api_keys / delivery_events / audit_logs / courier_locations
-- - delivery_orders: merchant_id, idempotency_key, public_id, 12-status CHECK
-- - status remap: searching→searching_courier, assigned→courier_assigned
-- - courier_accept_delivery / courier_update_location updated for new statuses
-- Applied: 2026-09-23
-- ============================================================

-- PostGIS (§25) — available 3.3.7, not previously installed
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- §17 merchants — new commercial tenant table (schema foundation)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
  merchant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  api_key_hash TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- merchant_api_keys — foundation for Phase B merchant onboarding
-- Phase A auth still uses delivery_api_keys (legacy dk_ keys)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_merchant ON merchant_api_keys(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_prefix ON merchant_api_keys(key_prefix);

-- ============================================================
-- delivery_events — status / lifecycle audit trail for a delivery
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT,
  payload JSONB,
  actor_type TEXT CHECK (actor_type IS NULL OR actor_type IN ('courier', 'system', 'api', 'admin')),
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON delivery_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_event ON delivery_events(event);

-- ============================================================
-- audit_logs — §42: 10 event types
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL CHECK (event IN (
    'delivery_created',
    'courier_assigned',
    'courier_accepted',
    'status_changed',
    'location_accessed',
    'delivery_cancelled',
    'delivery_completed',
    'api_key_created',
    'api_key_revoked',
    'admin_action'
  )),
  entity_type TEXT,
  entity_id UUID,
  actor_type TEXT CHECK (actor_type IS NULL OR actor_type IN ('courier', 'system', 'api', 'admin', 'user')),
  actor_id UUID,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================================
-- §24 courier_locations — GPS trail while on active delivery
-- courier_id has no FK (flexibility); delivery_id optional FK
-- ============================================================
CREATE TABLE IF NOT EXISTS courier_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL,
  delivery_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_locations_delivery ON courier_locations(delivery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_locations_courier ON courier_locations(courier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_locations_created ON courier_locations(created_at DESC);

-- ============================================================
-- delivery_orders: dual-run columns (external_order_id → existing external_id)
-- ============================================================
ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(merchant_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS public_id TEXT;

-- Backfill public_id for existing rows
UPDATE delivery_orders
SET public_id = 'del_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE public_id IS NULL;

-- Unique public_id (ignore if concurrent backfill races — single migration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_public_id
  ON delivery_orders(public_id) WHERE public_id IS NOT NULL;

-- Idempotency / external_id uniqueness scoped per merchant
-- NULL merchant_id rows (legacy dk_ keys) do not conflict (PG NULL-distinct)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_merchant_idempotency
  ON delivery_orders(merchant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_merchant_external
  ON delivery_orders(merchant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_merchant ON delivery_orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_idempotency_api ON delivery_orders(api_key_id, idempotency_key);

-- ============================================================
-- §7 status model: drop 6-status CHECK → remap → 12-status CHECK
-- ============================================================
ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_status_check;

UPDATE delivery_orders SET status = 'searching_courier' WHERE status = 'searching';
UPDATE delivery_orders SET status = 'courier_assigned' WHERE status = 'assigned';

ALTER TABLE delivery_orders
  ADD CONSTRAINT delivery_orders_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'searching_courier',
    'courier_assigned',
    'courier_to_pickup',
    'arrived_pickup',
    'picked_up',
    'courier_to_customer',
    'arrived_customer',
    'delivered',
    'cancelled',
    'failed'
  ));

-- ============================================================
-- public_id trigger — fill NULL on insert (id already defaulted)
-- ============================================================
CREATE OR REPLACE FUNCTION set_delivery_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := 'del_' || substr(replace(NEW.id::text, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_delivery_public_id ON delivery_orders;
CREATE TRIGGER trg_set_delivery_public_id
  BEFORE INSERT ON delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_delivery_public_id();

-- ============================================================
-- RLS: admin ALL (service_role bypasses RLS)
-- ============================================================
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_locations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage merchants" ON merchants FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage merchant api keys" ON merchant_api_keys FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage delivery events" ON delivery_events FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage audit logs" ON audit_logs FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage courier locations" ON courier_locations FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- courier_accept_delivery — accept pending | searching_courier → courier_assigned
-- webhook event name stays "order.accepted" (§70 dual-run compatibility)
-- ============================================================
CREATE OR REPLACE FUNCTION courier_accept_delivery(p_order_id UUID)
RETURNS JSON AS $$
DECLARE
  v_courier RECORD;
  v_order delivery_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_courier FROM delivery_couriers WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_courier.is_verified THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Not a verified courier');
  END IF;

  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'NOT_FOUND', 'message', 'Order not found');
  END IF;
  IF v_order.status NOT IN ('pending', 'searching_courier') OR v_order.courier_id IS NOT NULL THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Order is ' || v_order.status);
  END IF;
  IF v_order.is_sandbox THEN
    RETURN json_build_object('error', 'SANDBOX', 'message', 'Sandbox orders cannot be accepted');
  END IF;

  UPDATE delivery_orders SET status = 'courier_assigned', courier_id = auth.uid(), updated_at = now()
  WHERE id = p_order_id;

  UPDATE delivery_couriers SET status = 'busy', deliveries_count = deliveries_count + 1, last_seen = now()
  WHERE user_id = auth.uid();

  INSERT INTO delivery_tracking (order_id, courier_id, status, note)
  VALUES (p_order_id, auth.uid(), 'courier_assigned', 'Курьер назначен');

  PERFORM queue_delivery_webhooks(p_order_id, 'order.accepted', (json_build_object(
    'order_id', p_order_id,
    'courier_id', auth.uid(),
    'status', 'courier_assigned'
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', 'courier_assigned', 'courier_id', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- courier_update_location — active statuses = full §7 pipeline set
-- ============================================================
CREATE OR REPLACE FUNCTION courier_update_location(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS JSON AS $$
DECLARE
  v_active UUID;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN json_build_object('error', 'BAD_INPUT', 'message', 'lat/lng required');
  END IF;

  UPDATE delivery_couriers
  SET lat = p_lat, lng = p_lng, last_seen = now()
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Not a courier');
  END IF;

  SELECT id INTO v_active FROM delivery_orders
  WHERE courier_id = auth.uid()
    AND status IN (
      'courier_assigned',
      'courier_to_pickup',
      'arrived_pickup',
      'picked_up',
      'courier_to_customer',
      'arrived_customer'
    )
  ORDER BY created_at DESC LIMIT 1;

  IF v_active IS NOT NULL THEN
    INSERT INTO delivery_tracking (order_id, courier_id, status, lat, lng, note)
    VALUES (v_active, auth.uid(), 'courier.location', p_lat, p_lng, 'Позиция курьера');

    INSERT INTO courier_locations (courier_id, delivery_id, latitude, longitude)
    VALUES (auth.uid(), v_active, p_lat, p_lng);

    PERFORM queue_delivery_webhooks(v_active, 'courier.location', (json_build_object(
      'order_id', v_active,
      'courier_id', auth.uid(),
      'lat', p_lat,
      'lng', p_lng
    ))::jsonb);
  END IF;

  RETURN json_build_object('success', true, 'lat', p_lat, 'lng', p_lng);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION courier_accept_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION courier_update_location(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION set_delivery_public_id() TO service_role;
