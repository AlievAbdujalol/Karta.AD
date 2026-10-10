-- Трекинг заказа магазина для покупателя (спецификация §28, §47, §59).
--
-- Заказы магазина живут в orders (конвейер set_order_status; см.
-- deliveryProviders.js — отдельных таблиц доставки для заказов магазина
-- не создаётся). id заказа возвращается клиенту при создании и служит
-- capability-токеном: payload получает только владелец UUID (не угадать).
-- В payload — только публично-безопасные поля, без данных покупателя
-- (зеркало get_delivery_tracking §47, но без токенной таблицы: дублей нет).
--
-- Возраст заказа ограничен 30 днями (дух токенов доставки, жизнь 7 дней):
-- старые заказы отвечают found=false — без oracle существования.
-- ETA зеркалит calculate_delivery_price: 10 + ceil(distance_km * 3).
--
-- Идемпотентна, можно применять повторно.
-- Применять по одному statement; после DDL: SELECT pg_notify('pgrst','reload schema');

CREATE OR REPLACE FUNCTION public.get_store_order_tracking(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'order_id', o.id,
    'public_id', left(o.id::text, 8),
    'status', o.status,
    'delivery_type', o.delivery_type,
    'payment_method', o.payment_method,
    'total', o.total,
    'currency', o.currency,
    'shop_name', b.name,
    'shop_phone', b.phone,
    'pickup_address', b.address,
    'pickup_lat', b.lat,
    'pickup_lng', b.lng,
    'dropoff_address', o.delivery_address,
    'dropoff_lat', o.delivery_lat,
    'dropoff_lng', o.delivery_lng,
    'distance_km', d.dist,
    'eta_min', CASE WHEN d.dist IS NOT NULL THEN 10 + ceil(d.dist * 3)::integer END,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', oi.product_name, 'qty', oi.quantity, 'price', oi.price)
             ORDER BY oi.product_name)
      FROM public.order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb),
    'courier', NULL
  )
  INTO v
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN b.lat IS NULL OR o.delivery_lat IS NULL OR o.delivery_lng IS NULL THEN NULL
      ELSE round((6371 * acos(greatest(-1.0, least(1.0,
        cos(radians(b.lat)) * cos(radians(o.delivery_lat))
        * cos(radians(o.delivery_lng) - radians(b.lng))
        + sin(radians(b.lat)) * sin(radians(o.delivery_lat))
      ))))::numeric, 1)
    END AS dist
  ) d
  WHERE o.id = p_order_id
    AND o.created_at > now() - interval '30 days';

  RETURN COALESCE(v, jsonb_build_object('found', false));
END
$function$;

REVOKE ALL ON FUNCTION public.get_store_order_tracking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_order_tracking(uuid) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
