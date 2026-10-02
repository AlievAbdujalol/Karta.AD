-- ============================================================
-- Karta-AD Business — Phase 2: заказы и участники
-- Применено удалённо 2026-09-30 через MCP apply_migration
-- (по одному statement на миграцию: раннер режет plpgsql по ";",
-- поэтому set_order_status написан одним SQL-стейтментом через $fn$).
-- - orders.delivery_type: delivery | pickup | courier
-- - get_business_orders: + delivery_type, delivery_lat/lng
-- - set_order_status(p_order_id, p_status): смена статуса с проверкой
--   membership и допустимых переходов; возвращает NULL если нельзя
-- - business_members_select: участники видят друг друга
-- - updated_at-триггеры для orders/products
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'delivery'
  CHECK (delivery_type IN ('delivery', 'pickup', 'courier'));

-- DROP+CREATE: у функции изменился возвращаемый тип
-- DROP FUNCTION IF EXISTS public.get_business_orders(UUID, TEXT);
-- (тело — см. применённые миграции business_orders_phase2* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
