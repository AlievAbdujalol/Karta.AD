-- ============================================================
-- Karta-AD AI Website Builder — картинки секций (Storage)
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - bucket site-images (public read)
-- - write: только владелец папки {userId}/... (проекты per-user)
-- ============================================================

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('site-images', 'site-images', true)
-- ON CONFLICT (id) DO NOTHING;
-- + политики site_images_{select,insert,update,delete}
-- (см. миграции site_images_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
