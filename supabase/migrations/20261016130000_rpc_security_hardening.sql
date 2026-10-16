-- 20261016130000_rpc_security_hardening.sql
-- Укрепление SECURITY DEFINER RPC по итогам аудита advisor'ов.
-- Применено к production (MCP apply_migration), пробы зелёные.

-- 1) confirm_payment_by_provider — НЕ имел НИКАКОЙ авторизации: анонимный
--    клиент мог пометить любой платёж success и активировать подписку.
--    Клиентский код функцию НЕ вызывает (проверено grep по src/ и packages/);
--    легитимный вызов — серверный (webhook провайдера) с service_role.
--    Закрываем: EXECUTE только у service_role.
REVOKE EXECUTE ON FUNCTION public.confirm_payment_by_provider(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_by_provider(uuid, text, text)
  TO service_role;

-- 2) get_business_stats — аноним читал выручку/заказы ЛЮБОГО бизнеса.
--    Вызывается только с залогиненными страницами BusinessDashboard /
--    BusinessAnalytics — guard по роли бизнеса (та же модель, что в RLS
--    таблицы businesses). Возвращаемый формат JSON не менялся.
DROP FUNCTION public.get_business_stats(uuid);
CREATE FUNCTION public.get_business_stats(p_business_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (public.business_role(p_business_id) IS NULL AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Forbidden: статистика доступна только бизнесу или администратору';
  END IF;
  RETURN (
    SELECT json_build_object(
      'total_orders', (SELECT COUNT(*) FROM public.orders WHERE business_id = p_business_id),
      'active_orders', (SELECT COUNT(*) FROM public.orders WHERE business_id = p_business_id AND status NOT IN ('delivered','completed','cancelled','refunded')),
      'total_revenue', (SELECT COALESCE(SUM(total), 0) FROM public.orders WHERE business_id = p_business_id AND status IN ('delivered','completed')),
      'total_products', (SELECT COUNT(*) FROM public.products WHERE business_id = p_business_id AND is_active = true),
      'total_customers', (SELECT COUNT(DISTINCT customer_id) FROM public.orders WHERE business_id = p_business_id AND customer_id IS NOT NULL),
      'orders_today', (SELECT COUNT(*) FROM public.orders WHERE business_id = p_business_id AND created_at::date = now()::date),
      'revenue_today', (SELECT COALESCE(SUM(total), 0) FROM public.orders WHERE business_id = p_business_id AND status IN ('delivered','completed') AND created_at::date = now()::date)
    )
  );
END;
$$;

-- 3) Advisor «Function Search Path Mutable» — фиксируем search_path
--    у проектных функций (не расширения).
ALTER FUNCTION public.calculate_taxi_price(double precision, double precision, text, boolean) SET search_path = public;
ALTER FUNCTION public.taxi_nearby_summary(double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.ensure_project_slug() SET search_path = public;
ALTER FUNCTION public.handle_rsf_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_taxi_tariffs_updated_at() SET search_path = public;
ALTER FUNCTION public.order_items_normalize() SET search_path = public;
ALTER FUNCTION public.orders_recalc_total() SET search_path = public;

SELECT pg_notify('pgrst', 'reload schema');
