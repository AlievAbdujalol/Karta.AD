-- Такси: серверная нижняя граница цены при создании заказа.
--
-- Причина. Цену считает клиент (src/lib/taxi.js ridePrice) и присылает в
-- INSERT. Триггер protect_taxi_order_price стоял только на UPDATE, поэтому
-- заказ с price = 0.01 принимался (воспроизведено в транзакции с ROLLBACK
-- от имени реального пассажира). Пассажир мог уехать почти бесплатно.
--
-- Что делает миграция. Тот же триггер теперь срабатывает и на INSERT:
--   * расстояние считается на сервере по haversine от pickup до dropoff
--     (клиентские distance_km/duration_min не используются);
--   * нижняя граница = calculate_taxi_price(расстояние, 0, категория, night=false)
--     × 0.8 — 20% допуска на акции/округления; ночной коэффициент и доплаты
--     только повышают реальную цену, поэтому false безопасен;
--   * без координат остаётся минимальная базовая ставка категории;
--   * админ (is_admin()) может создать заказ с любой ценой.
-- UPDATE по-прежнему не может менять price.
--
-- Проверено на production: из 102 исторических заказов с координатами ни один
-- не ниже границы 0.8× (минимум 6.00 TJS — delivery), т.е. легитимные
-- заказы миграция не ломает.

CREATE OR REPLACE FUNCTION public.protect_taxi_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dist_km double precision;
  v_min numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.price IS DISTINCT FROM OLD.price AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'price cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.pickup_lat IS NOT NULL AND NEW.pickup_lng IS NOT NULL
     AND NEW.dropoff_lat IS NOT NULL AND NEW.dropoff_lng IS NOT NULL THEN
    v_dist_km := 6371 * acos(greatest(-1.0, least(1.0,
      cos(radians(NEW.pickup_lat)) * cos(radians(NEW.dropoff_lat)) *
      cos(radians(NEW.dropoff_lng) - radians(NEW.pickup_lng)) +
      sin(radians(NEW.pickup_lat)) * sin(radians(NEW.dropoff_lat))
    )));
  END IF;

  v_min := public.calculate_taxi_price(COALESCE(v_dist_km, 0), 0, NEW.category, false);
  IF NEW.price IS NULL OR NEW.price < round(v_min * 0.8, 2) THEN
    RAISE EXCEPTION 'price below route minimum';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_taxi_order_price ON public.taxi_orders;
CREATE TRIGGER trg_protect_taxi_order_price
  BEFORE INSERT OR UPDATE ON public.taxi_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_taxi_order_price();

SELECT pg_notify('pgrst', 'reload schema');
