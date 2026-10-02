-- ============================================================
-- Karta-AD AI Website Builder — публичные сайты и заказы
-- Применено удалённо 2026-10-02 через MCP apply_migration
-- (по одному statement на миграцию).
-- - get_public_sites(): опубликованные версии AI-проектов,
--   привязанных к активным бизнесам с координатами —
--   для маркеров «Открыть сайт» на общей карте
--   (SECURITY DEFINER, GRANT anon+authenticated)
-- - orders_insert_public / order_items_insert_public:
--   anon может создавать заказы только активным бизнесам
--   (корзина на опубликованных сайтах)
-- ============================================================

-- CREATE FUNCTION / CREATE POLICY — применены
-- (см. миграции public_sites_*, orders_public_insert,
--  order_items_insert_public в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
