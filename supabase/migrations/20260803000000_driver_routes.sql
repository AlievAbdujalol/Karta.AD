-- Multi-route support for drivers
-- Allows a driver profile to be assigned to multiple routes, each with its own
-- vehicle number plate and phone contact.

CREATE TABLE IF NOT EXISTS public.driver_routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  route_id    UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  vehicle_number TEXT,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_routes_driver ON public.driver_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_routes_route ON public.driver_routes(route_id);

ALTER TABLE public.driver_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_routes_select ON public.driver_routes;
CREATE POLICY driver_routes_select ON public.driver_routes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS driver_routes_insert ON public.driver_routes;
CREATE POLICY driver_routes_insert ON public.driver_routes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id OR is_admin());

DROP POLICY IF EXISTS driver_routes_update ON public.driver_routes;
CREATE POLICY driver_routes_update ON public.driver_routes
  FOR UPDATE TO authenticated
  USING (auth.uid() = driver_id OR is_admin())
  WITH CHECK (auth.uid() = driver_id OR is_admin());

DROP POLICY IF EXISTS driver_routes_delete ON public.driver_routes;
CREATE POLICY driver_routes_delete ON public.driver_routes
  FOR DELETE TO authenticated
  USING (auth.uid() = driver_id OR is_admin());
