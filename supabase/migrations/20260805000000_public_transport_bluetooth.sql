CREATE TABLE IF NOT EXISTS public.public_transport_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  remember_choice BOOLEAN DEFAULT true,
  combo_taxi BOOLEAN DEFAULT false,
  allowed_types TEXT[] DEFAULT ARRAY['bus','minibus'],
  max_walk_m INT DEFAULT 800,
  max_transfers INT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.public_transport_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY pt_settings_sel ON public.public_transport_settings FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pt_settings_ins ON public.public_transport_settings FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pt_settings_upd ON public.public_transport_settings FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.vehicle_settings ADD COLUMN IF NOT EXISTS bluetooth_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.vehicle_settings ADD COLUMN IF NOT EXISTS bluetooth_device_name TEXT;
ALTER TABLE public.vehicle_settings ADD COLUMN IF NOT EXISTS avoid_tolls BOOLEAN DEFAULT false;
ALTER TABLE public.vehicle_settings ADD COLUMN IF NOT EXISTS avoid_unpaved BOOLEAN DEFAULT false;
ALTER TABLE public.navigation_settings ADD COLUMN IF NOT EXISTS avoid_tolls BOOLEAN DEFAULT false;
ALTER TABLE public.navigation_settings ADD COLUMN IF NOT EXISTS avoid_unpaved BOOLEAN DEFAULT false;

-- allow broader route types
DO $$ BEGIN ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_type_check; EXCEPTION WHEN others THEN NULL; END $$;
ALTER TABLE public.routes ADD CONSTRAINT routes_type_check CHECK (type IN ('bus','minibus','trolley','tram','metro','train','funicular','monorail','ferry','cable','express_tram','aeroexpress','mcc','mcd','light_metro','speed_tram'));

SELECT pg_notify('pgrst','reload schema');
