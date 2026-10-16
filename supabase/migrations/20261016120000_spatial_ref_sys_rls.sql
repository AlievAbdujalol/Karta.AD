-- 20261016120000_spatial_ref_sys_rls.sql
-- Advisor «RLS Disabled»: public.spatial_ref_sys (системная таблица PostGIS).
--
-- СТАТУС: ПРИМЕНЕНО (частично + trigger-митигация).
--   ✓ push_config — политика-заглушка применена (INFO advisor убран).
--   ✓ spatial_ref_sys — RLS НЕ включён (таблица принадлежит supabase_admin,
--     роль postgres не может ни включить RLS, ни отозвать гранты: грантодатель
--     и владелец — supabase_admin). Вместо RLS применён trigger, который
--     блокирует INSERT/UPDATE/DELETE для ролей anon и authenticated.
--     Владелец (supabase_admin) и postgres сохраняют полный доступ
--     (нужен PostGIS-upgrade). Пробы: anon INSERT → ERROR
--     «spatial_ref_sys is read-only»; postgres INSERT → OK.

-- ─── push_config ─────────────────────────────────────────────────────
-- VAPID-ключи и webhook-секрет: RLS включён, но политик не было.
-- Политика USING(false) документирует «только service_role» (BYPASSRLS);
-- читают/пишут её только Edge Functions (push-send), клиент не обращается.
DROP POLICY IF EXISTS push_config_service_only ON public.push_config;
CREATE POLICY push_config_service_only
  ON public.push_config
  FOR SELECT
  USING (false);

-- ─── spatial_ref_sys: trigger-митигация вместо RLS ──────────────────
-- Таблица принадлежит supabase_admin (расширение postgis) — RLS и REVOKE
-- недоступны из роли postgres. Trigger блокирует запись из PostgREST-ролей.
CREATE OR REPLACE FUNCTION public._block_spatial_ref_sys_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'spatial_ref_sys is read-only';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_spatial_ref_sys_writes ON public.spatial_ref_sys;
CREATE TRIGGER trg_block_spatial_ref_sys_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.spatial_ref_sys
  FOR EACH ROW EXECUTE FUNCTION public._block_spatial_ref_sys_writes();

-- Advisor «Function Search Path Mutable» — фиксируем search_path и у неё.
ALTER FUNCTION public._block_spatial_ref_sys_writes() SET search_path = public;
