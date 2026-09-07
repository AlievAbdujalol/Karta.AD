-- Map module: saved_places, route_history, offline_maps, navigation_settings, vehicle_settings, truck_settings, map_events, location_shares/user_locations
-- Idempotent, safe to re-run

-- saved_places
CREATE TABLE IF NOT EXISTS public.saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('home','work','favorite','other')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON public.saved_places(user_id);
ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY saved_places_select ON public.saved_places FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY saved_places_insert ON public.saved_places FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY saved_places_update ON public.saved_places FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY saved_places_delete ON public.saved_places FOR DELETE TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- route_history
CREATE TABLE IF NOT EXISTS public.route_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  start_lat DOUBLE PRECISION, start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION, end_lng DOUBLE PRECISION,
  distance_km NUMERIC, duration_min NUMERIC,
  polyline JSONB,
  transport_mode TEXT DEFAULT 'driving' CHECK (transport_mode IN ('driving','taxi','walking','cycling','scooter','truck','bus','minibus')),
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_history_user ON public.route_history(user_id, created_at DESC);
ALTER TABLE public.route_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY route_history_select ON public.route_history FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY route_history_insert ON public.route_history FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY route_history_update ON public.route_history FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY route_history_delete ON public.route_history FOR DELETE TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- offline_maps
CREATE TABLE IF NOT EXISTS public.offline_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  region_name TEXT NOT NULL,
  bbox JSONB NOT NULL,
  tile_template TEXT,
  min_zoom INT DEFAULT 10, max_zoom INT DEFAULT 16,
  size_mb NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','downloading','ready','expired','failed')),
  local_path TEXT,
  downloaded_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offline_maps_user ON public.offline_maps(user_id);
ALTER TABLE public.offline_maps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY offline_maps_select ON public.offline_maps FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY offline_maps_insert ON public.offline_maps FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY offline_maps_update ON public.offline_maps FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY offline_maps_delete ON public.offline_maps FOR DELETE TO authenticated USING (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- navigation_settings
CREATE TABLE IF NOT EXISTS public.navigation_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  voice_enabled BOOLEAN DEFAULT true,
  voice_language TEXT DEFAULT 'ru',
  voice_volume NUMERIC DEFAULT 0.9,
  avoid_tolls BOOLEAN DEFAULT false,
  avoid_highways BOOLEAN DEFAULT false,
  avoid_ferries BOOLEAN DEFAULT true,
  avoid_unpaved BOOLEAN DEFAULT false,
  map_style TEXT DEFAULT 'standard',
  units TEXT DEFAULT 'metric' CHECK (units IN ('metric','imperial')),
  speed_alert BOOLEAN DEFAULT true,
  auto_reroute BOOLEAN DEFAULT true,
  auto_scale BOOLEAN DEFAULT true,
  cursor_style TEXT DEFAULT 'classic' CHECK (cursor_style IN ('classic','car','arrow')),
  show_traffic BOOLEAN DEFAULT true,
  night_mode TEXT DEFAULT 'auto' CHECK (night_mode IN ('auto','on','off','system')),
  pip_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.navigation_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY nav_settings_select ON public.navigation_settings FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY nav_settings_insert ON public.navigation_settings FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY nav_settings_update ON public.navigation_settings FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY nav_settings_delete ON public.navigation_settings FOR DELETE TO authenticated USING (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vehicle_settings
CREATE TABLE IF NOT EXISTS public.vehicle_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_type TEXT CHECK (preferred_type IN ('bus','minibus','car','taxi','scooter','bicycle','truck')),
  plate_number TEXT, fuel_type TEXT,
  auto_start BOOLEAN DEFAULT false,
  easy_routes BOOLEAN DEFAULT false,
  show_traffic_lights BOOLEAN DEFAULT true,
  green_wave_speed INT,
  suggest_better BOOLEAN DEFAULT true,
  use_sensors BOOLEAN DEFAULT true,
  taxi_mode BOOLEAN DEFAULT false,
  ads_on_stop BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.vehicle_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vehicle_settings_sel ON public.vehicle_settings FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vehicle_settings_ins ON public.vehicle_settings FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vehicle_settings_upd ON public.vehicle_settings FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- truck_settings
CREATE TABLE IF NOT EXISTS public.truck_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  truck_type TEXT DEFAULT '10t' CHECK (truck_type IN ('3.5t','10t','20t','custom')),
  length_m NUMERIC DEFAULT 6, height_m NUMERIC DEFAULT 3.5, width_m NUMERIC DEFAULT 2.5,
  weight_t NUMERIC DEFAULT 10, allowed_weight_t NUMERIC DEFAULT 10, axle_load_t NUMERIC DEFAULT 6,
  hazmat BOOLEAN DEFAULT false, explosive BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.truck_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY truck_settings_sel ON public.truck_settings FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY truck_settings_ins ON public.truck_settings FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY truck_settings_upd ON public.truck_settings FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- map_events
CREATE TABLE IF NOT EXISTS public.map_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('accident','roadwork','camera','closure','hazard','traffic','other')),
  category TEXT DEFAULT 'other',
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  description TEXT, verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_events_latlng ON public.map_events(lat,lng);
CREATE INDEX IF NOT EXISTS idx_map_events_expires ON public.map_events(expires_at) WHERE expires_at IS NOT NULL;
ALTER TABLE public.map_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY map_events_select ON public.map_events FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY map_events_select_auth ON public.map_events FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY map_events_insert ON public.map_events FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY map_events_update ON public.map_events FOR UPDATE TO authenticated USING (auth.uid()=user_id OR public.is_admin()) WITH CHECK (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY map_events_delete ON public.map_events FOR DELETE TO authenticated USING (auth.uid()=user_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- location_shares + user_locations (fix for useLocationSharing)
CREATE TABLE IF NOT EXISTS public.location_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sharer_id, shared_with_id)
);
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION, speed DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.location_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY location_shares_select ON public.location_shares FOR SELECT TO authenticated USING (auth.uid()=sharer_id OR auth.uid()=shared_with_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY location_shares_ins ON public.location_shares FOR INSERT TO authenticated WITH CHECK (auth.uid()=sharer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY location_shares_del ON public.location_shares FOR DELETE TO authenticated USING (auth.uid()=sharer_id OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY location_shares_upd ON public.location_shares FOR UPDATE TO authenticated USING (auth.uid()=sharer_id) WITH CHECK (auth.uid()=sharer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_locations_select ON public.user_locations FOR SELECT TO authenticated USING (
    auth.uid()=user_id OR EXISTS (SELECT 1 FROM public.location_shares ls WHERE ls.sharer_id=user_locations.user_id AND ls.shared_with_id=auth.uid() AND ls.status='active')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_locations_ins ON public.user_locations FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_locations_upd ON public.user_locations FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_locations_del ON public.user_locations FOR DELETE TO authenticated USING (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.map_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.route_history;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.get_shared_locations()
RETURNS SETOF public.user_locations
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT ul.* FROM public.user_locations ul
  JOIN public.location_shares ls ON ls.sharer_id=ul.user_id AND ls.shared_with_id=auth.uid() AND ls.status='active'
  WHERE ls.expires_at IS NULL OR ls.expires_at > now();
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_locations() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
