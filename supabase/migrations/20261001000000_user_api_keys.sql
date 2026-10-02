-- ============================================================
-- Karta-AD — личные AI-ключи пользователей
-- Применено удалённо 2026-10-01 через MCP apply_migration
-- (по одному statement на миграцию).
-- - user_api_keys: (user_id, provider, api_key),
--   provider: openrouter | gemini; у каждого свой ключ
-- - RLS: только свои строки (SELECT/INSERT/UPDATE/DELETE)
-- ============================================================

-- CREATE TABLE + политики — применены
-- (см. миграции user_api_keys_* в истории проекта)

SELECT pg_notify('pgrst', 'reload schema');
