-- ============================================================
-- Karta-AD AI — журнал использования (без секретов и текстов)
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - ai_logs: user_id, model, ok, status, ms, fallback,
--   error_code, prompt_chars (длина, не текст), created_at
-- - RLS: читать свои; пишет Edge Function (service_role)
-- ============================================================

-- CREATE TABLE + политики + индекс — применены
-- (см. миграции ai_logs_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
