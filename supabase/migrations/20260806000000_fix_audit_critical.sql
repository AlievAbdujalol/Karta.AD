-- P0 Audit fix: RLS, XSS checks, privileges
-- Re-enable RLS where disabled
ALTER TABLE IF EXISTS public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.taxi_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- profiles_select restrict
DO $$ BEGIN
  DROP POLICY IF EXISTS profiles_select ON public.profiles;
EXCEPTION WHEN others THEN NULL; END $$;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin());

-- ensure profiles update cannot escalate role
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Нельзя менять роль без прав администратора';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_role ON public.profiles;
CREATE TRIGGER trg_protect_role BEFORE UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- taxi_wallet_transactions policies
DO $$ BEGIN CREATE POLICY wallet_sel ON public.taxi_wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = driver_id OR public.is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY wallet_ins ON public.taxi_wallet_transactions FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR (auth.uid() = driver_id AND type IN ('earnings','bonus'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- revoke public execute on find_nearby
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.find_nearby_taxi_drivers(double precision, double precision, double precision, text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.find_nearby_taxi_drivers(double precision, double precision, double precision, text) TO service_role; EXCEPTION WHEN others THEN NULL; END $$;

-- XSS: check constraints for routes
DO $$ BEGIN ALTER TABLE public.routes ADD CONSTRAINT chk_routes_number CHECK (number ~ '^[0-9A-Za-zА-Яа-я\-_/ ]+$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.routes ADD CONSTRAINT chk_routes_color CHECK (color ~ '^#[0-9a-fA-F]{6}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT pg_notify('pgrst','reload schema');
