-- Restrict routes management to owner-only for admins
-- Before: any admin could SELECT/INSERT/UPDATE/DELETE any route
-- After:  admin can manage only routes they created (created_by_id = auth.uid())
--         super-admin (first admin in the table) keeps full access for system migrations

-- The super-admin is identified by the earliest admin in profiles.
-- Since is_admin() already exists, we add a helper that detects the first admin.

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
    ORDER BY created_at LIMIT 1
  ) AND auth.uid() = (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Replace routes policies
DROP POLICY IF EXISTS routes_select ON public.routes;
CREATE POLICY routes_select ON public.routes
  FOR SELECT TO authenticated
  USING (
    is_super_admin()  -- super-admin sees all
    OR created_by_id = auth.uid()  -- owner sees own
    OR is_admin() = false  -- non-admins (passengers, drivers) see all routes (for map)
  );

DROP POLICY IF EXISTS routes_insert ON public.routes;
CREATE POLICY routes_insert ON public.routes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR created_by_id = auth.uid()
  );

DROP POLICY IF EXISTS routes_update ON public.routes;
CREATE POLICY routes_update ON public.routes
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR created_by_id = auth.uid())
  WITH CHECK (is_super_admin() OR created_by_id = auth.uid());

DROP POLICY IF EXISTS routes_delete ON public.routes;
CREATE POLICY routes_delete ON public.routes
  FOR DELETE TO authenticated
  USING (is_super_admin() OR created_by_id = auth.uid());

-- Same logic for driver_routes (per-route moderation by route owner)
DROP POLICY IF EXISTS driver_routes_update ON public.driver_routes;
CREATE POLICY driver_routes_update ON public.driver_routes
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM public.routes r WHERE r.id = driver_routes.route_id AND r.created_by_id = auth.uid())
  )
  WITH CHECK (
    is_super_admin()
    OR auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM public.routes r WHERE r.id = driver_routes.route_id AND r.created_by_id = auth.uid())
  );
