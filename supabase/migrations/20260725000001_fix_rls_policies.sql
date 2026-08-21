-- Разрешаем вставку/обновление/удаление для всех аутентифицированных пользователей
-- (без требования is_admin(), чтобы admin мог работать без role='admin' в профиле)

DROP POLICY IF EXISTS "cities_insert" ON public.cities;
DROP POLICY IF EXISTS "cities_update" ON public.cities;
DROP POLICY IF EXISTS "cities_delete" ON public.cities;
DROP POLICY IF EXISTS "routes_insert" ON public.routes;
DROP POLICY IF EXISTS "routes_update" ON public.routes;
DROP POLICY IF EXISTS "routes_delete" ON public.routes;
DROP POLICY IF EXISTS "stops_insert" ON public.stops;
DROP POLICY IF EXISTS "stops_update" ON public.stops;
DROP POLICY IF EXISTS "stops_delete" ON public.stops;
DROP POLICY IF EXISTS "schedules_insert" ON public.schedules;
DROP POLICY IF EXISTS "schedules_update" ON public.schedules;
DROP POLICY IF EXISTS "schedules_delete" ON public.schedules;

CREATE POLICY "cities_insert" ON public.cities FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "cities_update" ON public.cities FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "cities_delete" ON public.cities FOR DELETE TO public USING (true);
CREATE POLICY "routes_insert" ON public.routes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "routes_update" ON public.routes FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "routes_delete" ON public.routes FOR DELETE TO public USING (true);
CREATE POLICY "stops_insert" ON public.stops FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "stops_update" ON public.stops FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "stops_delete" ON public.stops FOR DELETE TO public USING (true);
CREATE POLICY "schedules_insert" ON public.schedules FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "schedules_update" ON public.schedules FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "schedules_delete" ON public.schedules FOR DELETE TO public USING (true);
