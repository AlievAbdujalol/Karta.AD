-- ============================================================
-- Karta-AD AI Website Builder — файлы мультифайл-проектов
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - ai_project_files: project_id, path (UNIQUE на проект),
--   content, size — живые файлы проекта
-- - ai_project_versions.files JSONB: снапшот файлов на версию
--   (undo/redo и публичный просмотр без лишних запросов)
-- - RLS: файлы — только владелец проекта;
--   опубликованные версии читают все (снапшот внутри строки версии)
-- - Storage site-files: ассеты проектов (public read,
--   запись в свою папку {userId}/...)
-- ============================================================

-- CREATE TABLE + политики + индекс + колонка files — применены
-- (см. миграции ai_project_files_*, ai_files_*, site_files_*,
--  ai_versions_files_col в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
