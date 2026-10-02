-- ============================================================
-- Karta-AD AI Website Builder — проекты и версии
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - ai_projects: user_id, business_id, name, description
-- - ai_project_versions: project_id, version, title, prompt,
--   structure JSONB, html, is_published, created_by
-- - RLS: проекты — только свои; версии — свои + публичные чтение
-- ============================================================

-- CREATE TABLE + политики + индексы — применены
-- (см. миграции ai_projects_*, ai_versions_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
