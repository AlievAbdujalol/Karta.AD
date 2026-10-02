-- ============================================================
-- Karta-AD Business — Phase 3: гео (адрес на карте)
-- Применено удалённо 2026-09-30 через MCP apply_migration
-- (по одному statement на миграцию: раннер режет тела по ";").
-- - businesses.lat / businesses.lng (точка магазина на карте)
-- - get_my_businesses: + lat, lng (DROP+CREATE — сменился тип)
-- - get_public_businesses(): витринные поля активных бизнесов
--   с координатами; доступ anon+authenticated
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- DROP FUNCTION IF EXISTS public.get_my_businesses();
-- (тело — см. применённые миграции business_geo_phase3* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
