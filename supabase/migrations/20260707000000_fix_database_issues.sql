-- MIGRATION: Fix database issues (UUIDs, RLS, missing columns/tables, Realtime, Indexes)

-- 1. Create `stops` table if not exists
CREATE TABLE IF NOT EXISTS public.stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Update `routes` table
-- Add created_by_id if not exists
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- Add fare columns if not exists
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS fare_bus NUMERIC(10, 2);
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS fare_minibus NUMERIC(10, 2);

-- 3. Update UUID defaults for all relevant tables
-- Ensure UUID default is gen_random_uuid() for primary keys
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.routes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.vehicles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.favorite_routes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.subscription_payments ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. Enable RLS on new table
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing strict RLS policies
DO $$
BEGIN
    -- Routes
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.routes;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.routes;
    DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.routes;
    DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.routes;
    DROP POLICY IF EXISTS "routes_select" ON public.routes;
    DROP POLICY IF EXISTS "routes_insert" ON public.routes;
    DROP POLICY IF EXISTS "routes_update" ON public.routes;
    DROP POLICY IF EXISTS "routes_delete" ON public.routes;

    -- Vehicles
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.vehicles;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.vehicles;
    DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.vehicles;
    DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.vehicles;
    DROP POLICY IF EXISTS "vehicles_select" ON public.vehicles;
    DROP POLICY IF EXISTS "vehicles_insert" ON public.vehicles;
    DROP POLICY IF EXISTS "vehicles_update" ON public.vehicles;
    DROP POLICY IF EXISTS "vehicles_delete" ON public.vehicles;

    -- Profiles
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
    DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

    -- Stops
    DROP POLICY IF EXISTS "stops_select" ON public.stops;
    DROP POLICY IF EXISTS "stops_insert" ON public.stops;
    DROP POLICY IF EXISTS "stops_update" ON public.stops;
    DROP POLICY IF EXISTS "stops_delete" ON public.stops;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if policies do not exist
END $$;

-- 6. Create flexible RLS policies
-- ROUTES
CREATE POLICY "routes_select" ON public.routes FOR SELECT USING (true);
CREATE POLICY "routes_insert" ON public.routes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "routes_update" ON public.routes FOR UPDATE USING (auth.uid() = created_by_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "routes_delete" ON public.routes FOR DELETE USING (auth.uid() = created_by_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- VEHICLES
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE USING (auth.uid() = driver_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE USING (auth.uid() = driver_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- STOPS
CREATE POLICY "stops_select" ON public.stops FOR SELECT USING (true);
CREATE POLICY "stops_insert" ON public.stops FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "stops_update" ON public.stops FOR UPDATE USING (auth.uid() = created_by_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "stops_delete" ON public.stops FOR DELETE USING (auth.uid() = created_by_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 7. Add Realtime (Publication)
-- Supabase automatically sets up `supabase_realtime` publication, we just need to add tables
-- Note: PostgreSQL `ALTER PUBLICATION` cannot use `IF NOT EXISTS` for adding tables directly without throwing an error if it's already there in some PG versions, so we catch exceptions if needed, but adding a table again usually throws an error. We will just execute it.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
EXCEPTION WHEN OTHERS THEN END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
EXCEPTION WHEN OTHERS THEN END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stops;
EXCEPTION WHEN OTHERS THEN END $$;

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_lat_lng ON public.vehicles(lat, lng);
CREATE INDEX IF NOT EXISTS idx_vehicles_route_id ON public.vehicles(route_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles(driver_id);

CREATE INDEX IF NOT EXISTS idx_stops_lat_lng ON public.stops(lat, lng);
CREATE INDEX IF NOT EXISTS idx_stops_route_id ON public.stops(route_id);

CREATE INDEX IF NOT EXISTS idx_routes_created_by_id ON public.routes(created_by_id);
