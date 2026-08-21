-- Курьерский цикл доставки + webhook-отправка из БД (pg_net)
-- Применено: 2026-08-01

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============ Webhook dispatch из БД (единый механизм) ============
CREATE OR REPLACE FUNCTION webhook_dispatch_event()
RETURNS TRIGGER AS $$
DECLARE
  v_cfg RECORD;
  v_body JSONB;
  v_sig TEXT;
  v_headers JSONB;
BEGIN
  SELECT url, secret INTO v_cfg FROM delivery_webhook_configs WHERE id = NEW.config_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_body := jsonb_build_object(
    'event', NEW.event,
    'order_id', NEW.order_id,
    'data', NEW.payload,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_sig := 'sha256=' || encode(hmac(v_body::text::bytea, v_cfg.secret::bytea, 'sha256'), 'hex');

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Karta-Signature', v_sig,
    'X-Karta-Event', NEW.event,
    'X-Karta-Order', NEW.order_id
  );

  PERFORM net.http_post(url := v_cfg.url, body := v_body, headers := v_headers);

  UPDATE delivery_webhook_events
  SET status = 'sent', attempts = 1, sent_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_delivery_webhook_dispatch ON delivery_webhook_events;
CREATE TRIGGER trg_delivery_webhook_dispatch
AFTER INSERT ON delivery_webhook_events
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION webhook_dispatch_event();

-- ============ Вспомогательная: поставить события webhook для заказа ============
CREATE OR REPLACE FUNCTION queue_delivery_webhooks(p_order_id UUID, p_event TEXT, p_payload JSONB)
RETURNS void AS $$
BEGIN
  INSERT INTO delivery_webhook_events (config_id, order_id, event, payload)
  SELECT cfg.id, p_order_id, p_event, p_payload
  FROM delivery_webhook_configs cfg
  JOIN delivery_orders o ON o.api_key_id = cfg.api_key_id AND o.id = p_order_id
  WHERE cfg.is_active = true
    AND (cfg.events IS NULL OR p_event = ANY(cfg.events))
    AND o.is_sandbox = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ Курьер: принять заказ ============
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
  IF v_order.status <> 'pending' OR v_order.courier_id IS NOT NULL THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Order is ' || v_order.status);
  END IF;
  IF v_order.is_sandbox THEN
    RETURN json_build_object('error', 'SANDBOX', 'message', 'Sandbox orders cannot be accepted');
  END IF;

  UPDATE delivery_orders SET status = 'assigned', courier_id = auth.uid(), updated_at = now()
  WHERE id = p_order_id;

  UPDATE delivery_couriers SET status = 'busy', deliveries_count = deliveries_count + 1, last_seen = now()
  WHERE user_id = auth.uid();

  INSERT INTO delivery_tracking (order_id, courier_id, status, note)
  VALUES (p_order_id, auth.uid(), 'assigned', 'Курьер назначен');

  PERFORM queue_delivery_webhooks(p_order_id, 'order.accepted', (json_build_object(
    'order_id', p_order_id,
    'courier_id', auth.uid(),
    'status', 'assigned'
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', 'assigned', 'courier_id', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ Курьер: обновить статус (picked_up / delivered) ============
CREATE OR REPLACE FUNCTION courier_update_delivery_status(p_order_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_courier RECORD;
  v_order delivery_orders%ROWTYPE;
  v_event TEXT;
BEGIN
  SELECT * INTO v_courier FROM delivery_couriers WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_courier.is_verified THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Not a verified courier');
  END IF;

  IF p_status NOT IN ('picked_up', 'delivered') THEN
    RETURN json_build_object('error', 'BAD_STATUS', 'message', 'Only picked_up or delivered');
  END IF;

  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'NOT_FOUND', 'message', 'Order not found');
  END IF;
  IF v_order.courier_id <> auth.uid() THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Order not assigned to you');
  END IF;
  IF v_order.status = 'delivered' THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Order already delivered');
  END IF;

  v_event := CASE WHEN p_status = 'picked_up' THEN 'order.started' ELSE 'order.completed' END;

  UPDATE delivery_orders SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO delivery_tracking (order_id, courier_id, status, note)
  VALUES (p_order_id, auth.uid(), p_status, COALESCE(p_note, CASE WHEN p_status = 'picked_up' THEN 'Товар получен курьером' ELSE 'Доставлено получателю' END));

  IF p_status = 'delivered' THEN
    UPDATE delivery_couriers SET status = 'online', last_seen = now() WHERE user_id = auth.uid();
  END IF;

  PERFORM queue_delivery_webhooks(p_order_id, v_event, (json_build_object(
    'order_id', p_order_id,
    'courier_id', auth.uid(),
    'status', p_status,
    'note', p_note
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ Курьер: обновить геопозицию ============
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
  WHERE courier_id = auth.uid() AND status IN ('assigned', 'picked_up')
  ORDER BY created_at DESC LIMIT 1;

  IF v_active IS NOT NULL THEN
    INSERT INTO delivery_tracking (order_id, courier_id, status, lat, lng, note)
    VALUES (v_active, auth.uid(), 'courier.location', p_lat, p_lng, 'Позиция курьера');

    PERFORM queue_delivery_webhooks(v_active, 'courier.location', (json_build_object(
      'order_id', v_active,
      'courier_id', auth.uid(),
      'lat', p_lat,
      'lng', p_lng
    ))::jsonb);
  END IF;

  RETURN json_build_object('success', true, 'lat', p_lat, 'lng', p_lng);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ Уведомлять курьеров при создании заказа (не sandbox) ============
CREATE OR REPLACE FUNCTION delivery_notify_new_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
  v_order delivery_orders%ROWTYPE;
  v_courier RECORD;
BEGIN
  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.is_sandbox THEN RETURN; END IF;

  FOR v_courier IN
    SELECT user_id FROM delivery_couriers WHERE status = 'online' AND is_verified = true
  LOOP
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      v_courier.user_id,
      'Новый заказ доставки #' || v_order.order_number,
      COALESCE(v_order.dropoff_address, 'Доставка') || ' — ' || COALESCE(v_order.price, 0) || ' сомони',
      'delivery_order'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION courier_accept_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION courier_update_delivery_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION courier_update_location(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_delivery_webhooks(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION webhook_dispatch_event() TO service_role;
