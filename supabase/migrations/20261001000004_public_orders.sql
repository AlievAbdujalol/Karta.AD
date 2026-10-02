-- ============================================================
-- Karta-AD Business — публичные заказы с сайтов (Storage нет)
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - orders_insert_public: anon может создавать заказы
--   только активным бизнесам
-- - order_items_insert_public: anon, позиции только к заказам
--   активных бизнесов
-- ============================================================

-- CREATE POLICY ... — применены
-- (см. миграции orders_public_insert, order_items_insert_public)

SELECT pg_notify('pgrst', 'reload schema');
