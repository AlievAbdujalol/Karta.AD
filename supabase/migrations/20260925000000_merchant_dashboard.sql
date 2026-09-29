-- ============================================================
-- Merchant Dashboard RPC (public /merchant) — Phase B
-- Spec: KARTA_AD_DELIVERY_SPEC.md §46, §44
-- - get_merchant_dashboard(p_api_key): SECURITY DEFINER, scoped
--   to one delivery_api_keys row; no cross-merchant data
-- - Shop sees only: own orders, couriers on own orders,
--   own webhook configs/events, own stats / api logs
-- Applied: 2026-09-25
-- ============================================================

CREATE OR REPLACE FUNCTION get_merchant_dashboard(p_api_key TEXT)
RETURNS JSON AS $$
DECLARE
  v_key delivery_api_keys%ROWTYPE;
  v_orders JSON;
  v_couriers JSON;
  v_webhooks JSON;
  v_events JSON;
  v_api_logs JSON;
  v_stats JSON;
BEGIN
  IF p_api_key IS NULL OR length(p_api_key) < 8 THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT * INTO v_key
  FROM delivery_api_keys
  WHERE api_key = p_api_key
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  -- §46 Заказы: last 100 for this key only
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_orders
  FROM (
    SELECT
      o.id,
      o.public_id,
      o.order_number,
      o.external_id,
      o.status,
      o.pickup_address,
      o.dropoff_address,
      o.pickup_lat,
      o.pickup_lng,
      o.dropoff_lat,
      o.dropoff_lng,
      o.recipient_name,
      o.recipient_phone,
      o.item_description,
      o.item_weight_kg,
      o.price,
      o.total,
      o.currency,
      o.eta_min,
      o.distance_km,
      o.payment_method,
      o.payment_status,
      o.notes,
      o.cancel_reason,
      o.is_sandbox,
      o.created_at,
      o.updated_at,
      o.courier_id,
      (
        SELECT json_build_object(
          'first_name', COALESCE(NULLIF(split_part(p.full_name, ' ', 1), ''), 'Курьер'),
          'phone', p.phone,
          'rating', dc.rating,
          'status', dc.status,
          'lat', dc.lat,
          'lng', dc.lng
        )
        FROM profiles p
        LEFT JOIN delivery_couriers dc ON dc.user_id = p.id
        WHERE p.id = o.courier_id
      ) AS courier
    FROM delivery_orders o
    WHERE o.api_key_id = v_key.id
    ORDER BY o.created_at DESC
    LIMIT 100
  ) t;

  -- §46 Курьеры: couriers ever assigned to this merchant's orders
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_couriers
  FROM (
    SELECT DISTINCT ON (p.id)
      p.id AS user_id,
      COALESCE(NULLIF(split_part(p.full_name, ' ', 1), ''), 'Курьер') AS first_name,
      p.phone,
      dc.status,
      dc.lat,
      dc.lng,
      dc.rating,
      dc.deliveries_count,
      dc.is_verified,
      dc.last_seen
    FROM delivery_orders o
    JOIN profiles p ON p.id = o.courier_id
    LEFT JOIN delivery_couriers dc ON dc.user_id = p.id
    WHERE o.api_key_id = v_key.id
      AND o.courier_id IS NOT NULL
    ORDER BY p.id, dc.last_seen DESC NULLS LAST
  ) t;

  -- §46 Webhooks: own configs (include secret — merchant verifies our signatures)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_webhooks
  FROM (
    SELECT
      c.id,
      c.url,
      c.secret,
      c.events,
      c.is_active,
      c.created_at,
      c.updated_at
    FROM delivery_webhook_configs c
    WHERE c.api_key_id = v_key.id
    ORDER BY c.created_at DESC
  ) t;

  -- §46 Webhooks: recent delivery events for own configs
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_events
  FROM (
    SELECT
      e.id,
      e.config_id,
      e.order_id,
      e.event,
      e.status,
      e.http_code,
      e.attempts,
      e.error,
      e.created_at,
      e.sent_at
    FROM delivery_webhook_events e
    JOIN delivery_webhook_configs c ON c.id = e.config_id
    WHERE c.api_key_id = v_key.id
    ORDER BY e.created_at DESC
    LIMIT 50
  ) t;

  -- §46 API: recent request journal for this key (no request bodies)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_api_logs
  FROM (
    SELECT
      l.id,
      l.method,
      l.path,
      l.status,
      l.ms,
      l.created_at
    FROM delivery_api_logs l
    WHERE l.api_key_id = v_key.id
    ORDER BY l.created_at DESC
    LIMIT 50
  ) t;

  -- §46 Статистика
  SELECT json_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (
      WHERE status NOT IN ('delivered', 'cancelled', 'failed')
    ),
    'delivered', COUNT(*) FILTER (WHERE status = 'delivered'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'revenue', COALESCE(SUM(price) FILTER (WHERE status = 'delivered'), 0),
    'today', COUNT(*) FILTER (
      WHERE created_at::date = now()::date
    ),
    'by_status', COALESCE(
      (
        SELECT json_object_agg(status, cnt)
        FROM (
          SELECT status, COUNT(*) AS cnt
          FROM delivery_orders
          WHERE api_key_id = v_key.id
          GROUP BY status
        ) s
      ),
      '{}'::json
    )
  ) INTO v_stats
  FROM delivery_orders
  WHERE api_key_id = v_key.id;

  RETURN json_build_object(
    'found', true,
    'shop', json_build_object(
      'id', v_key.id,
      'shop_name', v_key.shop_name,
      'contact_name', v_key.contact_name,
      'contact_phone', v_key.contact_phone,
      'contact_email', v_key.contact_email,
      'webhook_url', v_key.webhook_url,
      'is_sandbox', v_key.is_sandbox,
      'requests_count', v_key.requests_count,
      'last_request_at', v_key.last_request_at,
      'created_at', v_key.created_at
    ),
    'orders', v_orders,
    'couriers', v_couriers,
    'webhooks', v_webhooks,
    'webhook_events', v_events,
    'api_logs', v_api_logs,
    'stats', v_stats
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION get_merchant_dashboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_merchant_dashboard(TEXT) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
