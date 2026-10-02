-- ============================================================
-- Karta-AD Business — Phase 5: AI-сайты (vibe coding)
-- Применено удалённо 2026-09-30 через MCP apply_migration
-- (по одному statement на миграцию).
-- - business_sites: сгенерированные однофайловые HTML-сайты
--   (business_id, title, html, version, is_published)
-- - RLS: читать — опубликованные все + участники своих;
--   писать — owner/manager
-- ============================================================

-- CREATE TABLE IF NOT EXISTS public.business_sites (...) — применено
-- (см. миграции business_sites_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
