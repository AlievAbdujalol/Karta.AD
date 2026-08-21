CREATE TABLE IF NOT EXISTS delivery_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('dk_' || encode(gen_random_bytes(24), 'hex')),
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES delivery_api_keys(id) ON DELETE CASCADE,
  order_number SERIAL,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address TEXT,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  dropoff_address TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  item_description TEXT,
  item_weight_kg NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','searching','assigned','picked_up','delivered','cancelled')),
  assigned_driver_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE delivery_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage delivery API keys"
  ON delivery_api_keys FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage delivery orders"
  ON delivery_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION validate_delivery_api_key(p_api_key TEXT)
RETURNS TABLE(valid BOOLEAN, shop_id UUID, shop_name TEXT) AS $$
  SELECT dak.is_active, dak.id, dak.shop_name
  FROM delivery_api_keys dak
  WHERE dak.api_key = p_api_key
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION create_delivery_order(
  p_api_key TEXT,
  p_pickup_lat DOUBLE PRECISION,
  p_pickup_lng DOUBLE PRECISION,
  p_pickup_address TEXT,
  p_dropoff_lat DOUBLE PRECISION,
  p_dropoff_lng DOUBLE PRECISION,
  p_dropoff_address TEXT,
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_item_description TEXT DEFAULT '',
  p_item_weight_kg NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT ''
)
RETURNS JSON AS $$
DECLARE
  v_key RECORD;
  v_order delivery_orders%ROWTYPE;
  v_dist NUMERIC;
  v_price NUMERIC;
BEGIN
  SELECT * INTO v_key FROM delivery_api_keys dak WHERE dak.api_key = p_api_key AND dak.is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or inactive API key');
  END IF;

  v_dist := (
    6371 * acos(
      cos(radians(p_pickup_lat)) * cos(radians(p_dropoff_lat))
      * cos(radians(p_dropoff_lng) - radians(p_pickup_lng))
      + sin(radians(p_pickup_lat)) * sin(radians(p_dropoff_lat))
    )
  );
  v_price := GREATEST(6, 4 + (v_dist * 1.8));

  INSERT INTO delivery_orders (api_key_id, pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, recipient_name, recipient_phone, item_description, item_weight_kg, price, notes, status)
  VALUES (v_key.id, p_pickup_lat, p_pickup_lng, p_pickup_address, p_dropoff_lat, p_dropoff_lng, p_dropoff_address, p_recipient_name, p_recipient_phone, p_item_description, p_item_weight_kg, v_price, p_notes, 'pending')
  RETURNING * INTO v_order;

  RETURN json_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'price', v_order.price,
    'status', v_order.status,
    'created_at', v_order.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_delivery_order TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_delivery_api_key TO anon, authenticated;
