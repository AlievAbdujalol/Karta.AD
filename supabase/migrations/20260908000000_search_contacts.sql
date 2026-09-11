-- Поиск контактов для шаринга геолокации.
-- Проблема: политика profiles_select (fix_audit_critical) отдаёт только свой профиль,
-- поэтому поиск людей в GroupRoutePanel/LocationSharingPanel всегда пуст.
-- Решение: SECURITY DEFINER RPC возвращает ТОЛЬКО публичные поля (id, full_name, photo_url),
-- телефон/email/баланс наружу не отдаём (по телефону только ищем внутри).
-- Пустой запрос возвращает тех, с кем уже активен шаринг (управление доступом).

CREATE OR REPLACE FUNCTION public.search_contacts(search_text TEXT DEFAULT '')
RETURNS TABLE (id UUID, full_name TEXT, photo_url TEXT, is_shared BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  me UUID := auth.uid();
  pat TEXT;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  pat := '%' || REPLACE(REPLACE(REPLACE(COALESCE(search_text, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.photo_url,
    EXISTS (
      SELECT 1 FROM public.location_shares ls
      WHERE ls.sharer_id = me AND ls.shared_with_id = p.id AND ls.status = 'active'
    ) AS is_shared
  FROM public.profiles p
  WHERE p.id <> me
    AND (
      EXISTS (
        SELECT 1 FROM public.location_shares ls
        WHERE ls.sharer_id = me AND ls.shared_with_id = p.id AND ls.status = 'active'
      )
      OR (
        COALESCE(search_text, '') <> ''
        AND (p.full_name ILIKE pat ESCAPE '\' OR COALESCE(p.phone, '') ILIKE pat ESCAPE '\')
      )
    )
  ORDER BY is_shared DESC, p.full_name NULLS LAST
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contacts(TEXT) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
