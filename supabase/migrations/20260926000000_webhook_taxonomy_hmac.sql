-- ============================================================
-- Karta-AD Delivery — Phase B item 3: webhook taxonomy §18 + HMAC §19
-- Spec: KARTA_AD_DELIVERY_SPEC.md §18 (events), §19 (signature, replay)
-- - delivery_webhook_configs.events: default + reset to §18 8 events + courier.location
-- - webhook_dispatch_event(): body {event, delivery_id, external_order_id,
--   status, timestamp, nonce, event_id}; X-Karta-Signature = sha256=HMAC-SHA256(body, secret)
-- - rename emission points: order.accepted→courier.assigned,
--   order.started→delivery.picked_up, order.completed→delivery.delivered
-- - courier_update_delivery_status: +arrived_pickup, arrived_customer, failed → §18 events
-- - cancel_delivery_order: emit delivery.cancelled
-- - queue_delivery_webhooks: signature unchanged (doc comment only)
-- Applied: 2026-09-26
-- ============================================================

-- ============================================================
-- §18 default event list for new webhook configs
-- 8 spec events + optional non-spec courier.location
-- ============================================================
ALTER TABLE delivery_webhook_configs
  ALTER COLUMN events SET DEFAULT ARRAY[
    'delivery.created',
    'courier.assigned',
    'courier.arrived_pickup',
    'delivery.picked_up',
    'courier.arrived_customer',
    'delivery.delivered',
    'delivery.cancelled',
    'delivery.failed',
    'courier.location'
  ]::text[];

-- Reset existing configs with an explicit list to the full §18 set
-- (drops legacy order.* names and payment.completed; NULL = all events, kept)
UPDATE delivery_webhook_configs
SET events = ARRAY[
  'delivery.created',
  'courier.assigned',
  'courier.arrived_pickup',
  'delivery.picked_up',
  'courier.arrived_customer',
  'delivery.delivered',
  'delivery.cancelled',
  'delivery.failed',
  'courier.location'
]::text[],
updated_at = now()
WHERE events IS NOT NULL;

-- ============================================================
-- §18 + §19: dispatch body, signature, replay fields
-- delivery_id = public_id (spec example "del_123"), fallback UUID
-- ============================================================
CREATE OR REPLACE FUNCTION webhook_dispatch_event()
RETURNS TRIGGER AS $$
DECLARE
  v_cfg RECORD;
  v_order RECORD;
  v_body JSONB;
  v_sig TEXT;
  v_headers JSONB;
  v_status TEXT;
  v_delivery_id TEXT;
BEGIN
  SELECT url, secret INTO v_cfg FROM delivery_webhook_configs WHERE id = NEW.config_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT public_id, external_id, status
  INTO v_order
  FROM delivery_orders
  WHERE id = NEW.order_id;

  v_status := COALESCE(NEW.payload->>'status', v_order.status, 'unknown');
  v_delivery_id := COALESCE(v_order.public_id, NEW.order_id::text);

  -- §18 payload + §19 replay protection (timestamp, nonce, event_id)
  v_body := jsonb_build_object(
    'event', NEW.event,
    'delivery_id', v_delivery_id,
    'external_order_id', v_order.external_id,
    'status', v_status,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'nonce', encode(extensions.gen_random_bytes(16), 'hex'),
    'event_id', NEW.id
  );

  -- §19: HMAC-SHA256(payload body, webhook_secret)
  v_sig := 'sha256=' || encode(extensions.hmac(v_body::text::bytea, v_cfg.secret::bytea, 'sha256'), 'hex');

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Karta-Signature', v_sig,
    'X-Karta-Event', NEW.event,
    'X-Karta-Order', NEW.order_id
  );

  -- net.http_post requires an absolute URL; accept bare hosts from admin UI
  IF v_cfg.url !~ '^https?://' THEN
    v_cfg.url := 'https://' || v_cfg.url;
  END IF;

  -- Never raise from the trigger: a dispatch failure must not roll back
  -- the delivery_webhook_events row (or the queue INSERT that caused it)
  BEGIN
    PERFORM net.http_post(url := v_cfg.url, body := v_body, headers := v_headers);

    UPDATE delivery_webhook_events
    SET status = 'sent', attempts = 1, sent_at = now()
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE delivery_webhook_events
    SET status = 'failed', attempts = 1, error = SQLERRM
    WHERE id = NEW.id;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ============================================================
-- queue_delivery_webhooks — signature UNCHANGED (Edge Function RPC)
-- Only the doc comment is updated; §18 field names are resolved at dispatch
-- ============================================================
CREATE OR REPLACE FUNCTION queue_delivery_webhooks(p_order_id UUID, p_event TEXT, p_payload JSONB)
RETURNS void AS $$
BEGIN
  -- p_event must be a §18 name (or optional 'courier.location');
  -- §18 fields (delivery_id, external_order_id, status, timestamp, nonce, event_id)
  -- are computed in webhook_dispatch_event() at dispatch time
  INSERT INTO delivery_webhook_events (config_id, order_id, event, payload)
  SELECT cfg.id, p_order_id, p_event, p_payload
  FROM delivery_webhook_configs cfg
  JOIN delivery_orders o ON o.api_key_id = cfg.api_key_id AND o.id = p_order_id
  WHERE cfg.is_active = true
    AND (cfg.events IS NULL OR p_event = ANY(cfg.events))
    AND o.is_sandbox = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- courier_accept_delivery — emit §18 courier.assigned (was order.accepted)
-- Base: Phase A version (pending | searching_courier → courier_assigned)
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

  PERFORM queue_delivery_webhooks(p_order_id, 'courier.assigned', (json_build_object(
    'order_id', p_order_id,
    'courier_id', auth.uid(),
    'status', 'courier_assigned'
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', 'courier_assigned', 'courier_id', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- courier_update_delivery_status — full §18 courier transitions
-- allowed p_status: arrived_pickup, picked_up, arrived_customer, delivered, failed
-- event map: → courier.arrived_pickup | delivery.picked_up |
--            courier.arrived_customer | delivery.delivered | delivery.failed
-- ============================================================
CREATE OR REPLACE FUNCTION courier_update_delivery_status(p_order_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_courier RECORD;
  v_order delivery_orders%ROWTYPE;
  v_event TEXT;
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO v_courier FROM delivery_couriers WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_courier.is_verified THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Not a verified courier');
  END IF;

  IF p_status NOT IN ('arrived_pickup', 'picked_up', 'arrived_customer', 'delivered', 'failed') THEN
    RETURN json_build_object('error', 'BAD_STATUS', 'message', 'Allowed: arrived_pickup, picked_up, arrived_customer, delivered, failed');
  END IF;

  SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'NOT_FOUND', 'message', 'Order not found');
  END IF;
  IF v_order.courier_id <> auth.uid() THEN
    RETURN json_build_object('error', 'FORBIDDEN', 'message', 'Order not assigned to you');
  END IF;
  IF v_order.status IN ('delivered', 'cancelled', 'failed') THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Order already ' || v_order.status);
  END IF;

  -- Reasonable transition validation within the courier pipeline
  v_ok := CASE p_status
    WHEN 'arrived_pickup'  THEN v_order.status IN ('courier_assigned', 'courier_to_pickup', 'arrived_pickup')
    WHEN 'picked_up'       THEN v_order.status IN ('courier_assigned', 'courier_to_pickup', 'arrived_pickup', 'picked_up')
    WHEN 'arrived_customer' THEN v_order.status IN ('picked_up', 'courier_to_customer', 'arrived_customer')
    WHEN 'delivered'       THEN v_order.status IN ('picked_up', 'courier_to_customer', 'arrived_customer')
    WHEN 'failed'          THEN v_order.status NOT IN ('delivered', 'cancelled', 'failed')
    ELSE false
  END;
  IF NOT v_ok THEN
    RETURN json_build_object('error', 'BAD_STATE', 'message', 'Cannot move from ' || v_order.status || ' to ' || p_status);
  END IF;

  -- §18 event names
  v_event := CASE p_status
    WHEN 'arrived_pickup'   THEN 'courier.arrived_pickup'
    WHEN 'picked_up'        THEN 'delivery.picked_up'
    WHEN 'arrived_customer' THEN 'courier.arrived_customer'
    WHEN 'delivered'        THEN 'delivery.delivered'
    WHEN 'failed'           THEN 'delivery.failed'
  END;

  UPDATE delivery_orders SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO delivery_tracking (order_id, courier_id, status, note)
  VALUES (
    p_order_id, auth.uid(), p_status,
    COALESCE(p_note, CASE p_status
      WHEN 'arrived_pickup'   THEN 'Курьер прибыл к точке забора'
      WHEN 'picked_up'        THEN 'Товар получен курьером'
      WHEN 'arrived_customer' THEN 'Курьер прибыл к получателю'
      WHEN 'delivered'        THEN 'Доставлено получателю'
      WHEN 'failed'           THEN 'Доставка не выполнена'
    END)
  );

  -- Terminal outcomes free the courier
  IF p_status IN ('delivered', 'failed') THEN
    UPDATE delivery_couriers SET status = 'online', last_seen = now() WHERE user_id = auth.uid();
  END IF;

  PERFORM queue_delivery_webhooks(p_order_id, v_event, (json_build_object(
    'order_id', p_order_id,
    'courier_id', auth.uid(),
    'status', p_status,
    'note', p_note
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', p_status, 'event', v_event);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- cancel_delivery_order — emit §18 delivery.cancelled
-- ============================================================
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

  PERFORM queue_delivery_webhooks(p_order_id, 'delivery.cancelled', (json_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancel_reason', p_reason
  ))::jsonb);

  RETURN json_build_object('success', true, 'id', p_order_id, 'status', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Grants — signatures unchanged; re-issue for idempotency
-- ============================================================
GRANT EXECUTE ON FUNCTION queue_delivery_webhooks(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION webhook_dispatch_event() TO service_role;
GRANT EXECUTE ON FUNCTION courier_accept_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION courier_update_delivery_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_delivery_order(TEXT, UUID, TEXT) TO anon, authenticated;

-- PostgREST schema cache refresh (required after DDL)
SELECT pg_notify('pgrst', 'reload schema');
