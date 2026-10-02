-- ============================================================
-- Karta-AD Business — Phase 4: фото товаров (Storage)
-- Применено удалённо 2026-09-30 через MCP apply_migration
-- (по одному statement на миграцию).
-- - bucket product-images (public read)
-- - write: owner/manager бизнеса из первой папки пути
--   ({business_id}/...), read: все
-- ============================================================

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('product-images', 'product-images', true)
-- ON CONFLICT (id) DO NOTHING;
-- + политики product_images_{select,insert,update,delete}
-- (см. применённые миграции business_product_images_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
