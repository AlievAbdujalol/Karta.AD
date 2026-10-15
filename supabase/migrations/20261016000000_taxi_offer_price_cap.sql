-- ============================================================================
-- TAXI: направленное предложение заказа водителю + потолок цены 50 TJS
-- ============================================================================

-- ─── 1. Водитель отклонил целевое предложение ───────────────────────────────
-- Пассажир закрепил searching-заказ за конкретным водителем (driver_id).
-- Прямой UPDATE driver_id = null водителем блокирует RLS: для UPDATE без
-- явного WITH CHECK применяется USING и к новой строке, а new.driver_id = null
-- больше не проходит auth.uid() = driver_id. Поэтому SECURITY DEFINER RPC:
-- заказ возвращается в общий поиск только если вызывающий — текущий водитель
-- и заказ всё ещё в поиске.
CREATE OR REPLACE FUNCTION public.taxi_release_offer(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.taxi_orders
     SET driver_id = NULL,
         updated_at = now()
   WHERE id = p_order_id
     AND driver_id = auth.uid()
     AND status = 'searching';
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.taxi_release_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taxi_release_offer(uuid) TO authenticated;

-- ─── 2. Потолок стоимости поездки ───────────────────────────────────────────
-- Зеркало клиента MAX_RIDE_PRICE_TJS = 50 (src/lib/taxi.js): цена поездки
-- никогда не выше 50 TJS; короткие поездки остаются дешевле.
CREATE OR REPLACE FUNCTION public.calculate_taxi_price(
    p_distance_km DOUBLE PRECISION,
    p_duration_min DOUBLE PRECISION,
    p_category TEXT DEFAULT 'economy',
    p_night BOOLEAN DEFAULT false
) RETURNS NUMERIC(10,2) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    base_price NUMERIC(10,2);
    per_km NUMERIC(10,2);
    per_min NUMERIC(10,2);
    min_price NUMERIC(10,2);
    night_coef NUMERIC(3,2);
    total NUMERIC(10,2);
BEGIN
    base_price := CASE p_category
        WHEN 'economy' THEN 5.00
        WHEN 'comfort' THEN 8.00
        WHEN 'comfort_plus' THEN 12.00
        WHEN 'minivan' THEN 15.00
        WHEN 'business' THEN 20.00
        WHEN 'electric' THEN 7.00
        WHEN 'women' THEN 6.00
        WHEN 'cargo' THEN 18.00
        WHEN 'delivery' THEN 4.00
        WHEN 'courier' THEN 5.00
        WHEN 'intercity' THEN 40.00
        ELSE 5.00
    END;
    per_km := CASE p_category
        WHEN 'economy' THEN 1.50
        WHEN 'comfort' THEN 2.00
        WHEN 'comfort_plus' THEN 2.50
        WHEN 'minivan' THEN 2.80
        WHEN 'business' THEN 3.50
        WHEN 'electric' THEN 1.60
        WHEN 'women' THEN 1.80
        WHEN 'cargo' THEN 3.00
        WHEN 'delivery' THEN 1.80
        WHEN 'courier' THEN 2.00
        WHEN 'intercity' THEN 2.20
        ELSE 1.50
    END;
    per_min := CASE WHEN p_category = 'intercity' THEN 0.50 ELSE 0.30 END;
    min_price := CASE p_category
        WHEN 'economy' THEN 7.00
        WHEN 'comfort' THEN 10.00
        WHEN 'comfort_plus' THEN 15.00
        WHEN 'minivan' THEN 18.00
        WHEN 'business' THEN 25.00
        WHEN 'electric' THEN 8.00
        WHEN 'women' THEN 8.00
        WHEN 'cargo' THEN 20.00
        WHEN 'delivery' THEN 6.00
        WHEN 'courier' THEN 7.00
        WHEN 'intercity' THEN 50.00
        ELSE 7.00
    END;
    night_coef := CASE WHEN p_night THEN 1.5 ELSE 1.0 END;
    total := (base_price + (per_km * p_distance_km) + (per_min * p_duration_min)) * night_coef;
    IF total < min_price THEN total := min_price; END IF;
    -- Потолок 50 TJS только на городские поездки; межгород и доставка/курьер
    -- считаются по расстоянию (клиент: MAX_RIDE_PRICE_TJS в src/lib/taxi.js)
    IF p_category NOT IN ('intercity', 'delivery', 'courier') THEN
        total := LEAST(total, 50.00);
    END IF;
    RETURN ROUND(total, 2);
END;
$$;
