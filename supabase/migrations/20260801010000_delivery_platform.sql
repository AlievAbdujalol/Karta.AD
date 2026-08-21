-- ============================================================
-- Karta-AD Delivery Platform — Full Schema
-- Order items, tracking, couriers, webhooks, API journal, sandbox
-- ============================================================

-- 1. Расширение API keys: секрет для подписи, песочница, статистика
ALTER TABLE delivery_api_keys
  ADD COLUMN IF NOT EXISTS secret TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requests_count BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMPTZ;

-- 2. Курьеры доставки (отдельно от taxi_drivers — магазинные заказы)
CREATE TABLE IF NOT EXISTS delivery_couriers (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'busy', 'offline')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rating NUMERIC DEFAULT 5,
  deliveries_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Позиции заказа
CREATE TABLE IF NOT EXISTS delivery_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0,
  weight_kg NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Трекинг заказа (история перемещений курьера)
CREATE TABLE IF NOT EXISTS delivery_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  courier_id UUID,
  status TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Webhook конфигурации магазина
CREATE TABLE IF NOT EXISTS delivery_webhook_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES delivery_api_keys(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  events TEXT[] DEFAULT ARRAY['order.created','order.accepted','order.started','order.completed','order.cancelled','courier.location','payment.completed'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Журнал webhook событий (retry очередь)
CREATE TABLE IF NOT EXISTS delivery_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES delivery_webhook_configs(id) ON DELETE CASCADE,
  order_id UUID,
  event TEXT NOT NULL,
  payload JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  http_code INTEGER,
  attempts INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- 7. Журнал API запросов (аудит + аналитика)
CREATE TABLE IF NOT EXISTS delivery_api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES delivery_api_keys(id) ON DELETE SET NULL,
  method TEXT,
  path TEXT,
  status INTEGER,
  ms INTEGER,
  ip TEXT,
  user_agent TEXT,
  body JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Расширение заказов: внешний ID магазина, сумма, курьер, трекинг, оплата
ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'TJS',
  ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS eta_min INTEGER,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','failed')),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_key ON delivery_orders(api_key_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_ext ON delivery_orders(external_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_items_order ON delivery_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_order ON delivery_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_webhook_events_pending ON delivery_webhook_events(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_delivery_api_logs_key ON delivery_api_logs(api_key_id, created_at DESC);

-- ============================================================
-- RLS: админ управляет всем; магазины читают ТОЛЬКО через Edge Function (service_role)
-- ============================================================
ALTER TABLE delivery_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_couriers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage delivery order items" ON delivery_order_items FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage delivery tracking" ON delivery_tracking FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage webhook configs" ON delivery_webhook_configs FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage webhook events" ON delivery_webhook_events FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage api logs" ON delivery_api_logs FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  CREATE POLICY "Admins manage couriers" ON delivery_couriers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Функции
-- ============================================================

-- Расчёт цены (общая для SDK и эндпоинтов)
CREATE OR REPLACE FUNCTION calculate_delivery_price(
  p_pickup_lat DOUBLE PRECISION,
  p_pickup_lng DOUBLE PRECISION,
  p_dropoff_lat DOUBLE PRECISION,
  p_dropoff_lng DOUBLE PRECISION,
  p_weight_kg NUMERIC DEFAULT 0
) RETURNS JSON AS $$
DECLARE
  v_dist NUMERIC;
  v_price NUMERIC;
  v_eta INTEGER;
BEGIN
  IF p_pickup_lat IS NULL OR p_dropoff_lat IS NULL THEN
    RETURN json_build_object('error', 'Missing coordinates');
  END IF;

  v_dist := (
    6371 * acos(
      LEAST(1, cos(radians(p_pickup_lat)) * cos(radians(p_dropoff_lat))
      * cos(radians(p_dropoff_lng) - radians(p_pickup_lng))
      + sin(radians(p_pickup_lat)) * sin(radians(p_dropoff_lat)))
    )
  );

  v_price := GREATEST(6, 4 + (v_dist * 1.8) + (COALESCE(p_weight_kg,0) * 0.5));
  v_eta := 10 + CEIL(v_dist * 3)::INTEGER;

  RETURN json_build_object(
    'distance_km', ROUND(v_dist::NUMERIC, 1),
    'price', ROUND(v_price, 2),
    'currency', 'TJS',
    'eta_min', v_eta
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Создание заказа с позициями (v2, полный)
CREATE OR REPLACE FUNCTION create_delivery_order_v2(
  p_api_key TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_pickup_lat DOUBLE PRECISION DEFAULT NULL,
  p_pickup_lng DOUBLE PRECISION DEFAULT NULL,
  p_pickup_address TEXT DEFAULT NULL,
  p_dropoff_lat DOUBLE PRECISION DEFAULT NULL,
  p_dropoff_lng DOUBLE PRECISION DEFAULT NULL,
  p_dropoff_address TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_recipient_phone TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_notes TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash'
) RETURNS JSON AS $$
DECLARE
  v_key RECORD;
  v_order delivery_orders%ROWTYPE;
  v_price JSON;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_weight NUMERIC := 0;
BEGIN
  SELECT * INTO v_key FROM delivery_api_keys dak
  WHERE dak.api_key = p_api_key AND dak.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'INVALID_API_KEY', 'message', 'Invalid or inactive API key');
  END IF;

  -- Считаем вес и сумму из позиций
  IF jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_total := v_total + COALESCE((v_item->>'price')::NUMERIC, 0) * COALESCE((v_item->>'qty')::NUMERIC, 1);
      v_weight := v_weight + COALESCE((v_item->>'weight_kg')::NUMERIC, 0) * COALESCE((v_item->>'qty')::NUMERIC, 1);
    END LOOP;
  END IF;

  -- Расчёт цены доставки
  IF p_pickup_lat IS NOT NULL AND p_dropoff_lat IS NOT NULL THEN
    v_price := calculate_delivery_price(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, v_weight);
    IF (v_price->>'error') IS NOT NULL THEN
      RETURN v_price;
    END IF;
  ELSE
    v_price := json_build_object('distance_km', 0, 'price', 0, 'eta_min', 10);
  END IF;

  INSERT INTO delivery_orders (
    api_key_id, external_id, pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address, recipient_name, recipient_phone,
    item_description, item_weight_kg, price, total, notes, status, eta_min, distance_km, payment_method
  ) VALUES (
    v_key.id, p_external_id, p_pickup_lat, p_pickup_lng, p_pickup_address,
    p_dropoff_lat, p_dropoff_lng, p_dropoff_address, p_recipient_name, p_recipient_phone,
    COALESCE((SELECT string_agg(v->>'name' || ' x' || COALESCE((v->>'qty')::TEXT,'1'), ', ') FROM jsonb_array_elements(p_items) v), ''),
    v_weight, (v_price->>'price')::NUMERIC, v_total, p_notes, 'pending', (v_price->>'eta_min')::INTEGER, (v_price->>'distance_km')::NUMERIC, p_payment_method
  ) RETURNING * INTO v_order;

  -- Позиции
  IF jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO delivery_order_items (order_id, name, qty, price, weight_kg)
    SELECT v_order.id, v_item->>'name', COALESCE((v_item->>'qty')::INTEGER, 1),
           COALESCE((v_item->>'price')::NUMERIC, 0), COALESCE((v_item->>'weight_kg')::NUMERIC, 0)
    FROM jsonb_array_elements(p_items) v_item;
  END IF;

  -- Первая точка трекинга
  INSERT INTO delivery_tracking (order_id, status, note)
  VALUES (v_order.id, 'pending', 'Заказ создан магазином');

  -- Статистика ключа
  UPDATE delivery_api_keys SET requests_count = requests_count + 1, last_request_at = now()
  WHERE id = v_key.id;

  RETURN json_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'price', v_order.price,
    'total', v_order.total,
    'distance_km', v_order.distance_km,
    'eta_min', v_order.eta_min,
    'status', v_order.status,
    'created_at', v_order.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Вспомогательная: заказ полностью (заказ + позиции + трекинг)
CREATE OR REPLACE FUNCTION get_delivery_order(p_order_id UUID)
RETURNS JSON AS $$
DECLARE
  v_order JSON;
BEGIN
  SELECT json_build_object(
    'order', row_to_json(o),
    'items', COALESCE((SELECT json_agg(row_to_json(i)) FROM delivery_order_items i WHERE i.order_id = o.id), '[]'),
    'tracking', COALESCE((SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC) FROM delivery_tracking t WHERE t.order_id = o.id), '[]')
  )
  INTO v_order
  FROM delivery_orders o WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN json_build_object('error', 'NOT_FOUND', 'message', 'Order not found');
  END IF;
  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Отмена заказа
CREATE OR REPLACE FUNCTION cancel_delivery_order(
  p_api_key TEXT,
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Requested by shop'
) RETURNS JSON AS $$
DECLARE
  v_key RECORD;
  v_order delivery_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM delivery_api_keys WHERE api_key = p_api_key AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'INVALID_API_KEY');
  END IF;

  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id AND api_key_id = v_key.id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'NOT_FOUND', 'message', 'Order not found for this key');
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Order already ' || v_order.status);
  END IF;

  UPDATE delivery_orders SET status = 'cancelled', cancel_reason = p_reason, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO delivery_tracking (order_id, status, note)
  VALUES (p_order_id, 'cancelled', 'Заказ отменён: ' || p_reason);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Найти ближайшего свободного курьера
CREATE OR REPLACE FUNCTION find_nearest_delivery_courier(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_max_km NUMERIC DEFAULT 10
) RETURNS JSON AS $$
DECLARE
  v_courier RECORD;
BEGIN
  SELECT dc.user_id, dc.rating, dc.deliveries_count,
         (6371 * acos(LEAST(1, cos(radians(p_lat)) * cos(radians(dc.lat))
         * cos(radians(dc.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(dc.lat))))) AS dist_km
  INTO v_courier
  FROM delivery_couriers dc
  WHERE dc.status = 'online' AND dc.is_verified = true AND dc.lat IS NOT NULL
  ORDER BY dist_km ASC
  LIMIT 1;

  IF v_courier IS NULL OR v_courier.dist_km > p_max_km THEN
    RETURN json_build_object('courier', NULL);
  END IF;

  RETURN json_build_object('courier', json_build_object(
    'user_id', v_courier.user_id, 'rating', v_courier.rating,
    'deliveries_count', v_courier.deliveries_count, 'distance_km', ROUND(v_courier.dist_km::NUMERIC, 1)
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Уведомить курьеров о новом заказе (realtime + таблица уведомлений)
CREATE OR REPLACE FUNCTION delivery_notify_new_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
  v_order delivery_orders%ROWTYPE;
  v_courier RECORD;
BEGIN
  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id;

  FOR v_courier IN
    SELECT user_id FROM delivery_couriers WHERE status = 'online' AND is_verified = true
  LOOP
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      v_courier.user_id,
      'Новый заказ доставки #' || v_order.order_number,
      (v_order.dropoff_address) || ' — ' || v_order.price || ' сомони',
      'delivery_order'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Уведомить клиента о статусе (в таблицу notifications по телефону — в Edge Function)

-- Подпись вебхука (используется в Edge Function, но оставим функцию проверки)
CREATE OR REPLACE FUNCTION delivery_verify_signature(p_payload TEXT, p_signature TEXT, p_secret TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_signature = 'sha256=' || encode(hmac(p_payload::bytea, p_secret::bytea, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Права
GRANT EXECUTE ON FUNCTION calculate_delivery_price TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_delivery_order_v2 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_delivery_order TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_delivery_order TO anon, authenticated;
GRANT EXECUTE ON FUNCTION find_nearest_delivery_courier TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_notify_new_order TO service_role;
GRANT EXECUTE ON FUNCTION delivery_verify_signature TO service_role;
