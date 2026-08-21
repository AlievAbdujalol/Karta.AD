-- Fix save regressions caused by over-restrictive RLS hardening.
-- Applies to: profiles (role/subscription/admin), routes/reviews insert owner,
--            passenger->driver rating writes, infinite recursion.

-- 0) BREAK infinite recursion: profiles_select ↔ taxi_orders_select.
--    profiles_select has EXISTS (SELECT 1 FROM taxi_orders ...) and
--    taxi_orders_select has EXISTS (SELECT 1 FROM profiles WHERE role='admin').
--    The raw subquery re-evaluates RLS on profiles → infinite recursion.
--    Fix: replace with is_admin() (SECURITY DEFINER, bypasses RLS).
DROP POLICY IF EXISTS taxi_orders_select ON public.taxi_orders;
CREATE POLICY taxi_orders_select ON public.taxi_orders
  FOR SELECT TO public
  USING (
    (auth.uid() = passenger_id)
    OR (auth.uid() = driver_id)
    OR is_admin()
  );

-- 1) profiles: allow legitimate self-writes (role change, subscription renewal,
--    balance fee deduction, admin_activated during paid upgrade).
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

-- 2) routes / reviews: inserts are owner-gated (created_by_id = auth.uid()), but
--    the admin UI submits inserts WITHOUT created_by_id. Default it so inserts
--    carry the caller identity, and backfill any existing NULL values.
ALTER TABLE public.routes ALTER COLUMN created_by_id SET DEFAULT auth.uid();
ALTER TABLE public.reviews ALTER COLUMN created_by_id SET DEFAULT auth.uid();

UPDATE public.routes r
SET created_by_id = p.id
FROM (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1) p
WHERE r.created_by_id IS NULL;

UPDATE public.reviews r
SET created_by_id = p.id
FROM (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1) p
WHERE r.created_by_id IS NULL;

-- 3) taxi_drivers: allow a passenger (participant of a completed order with the
--    driver) to trigger server-side rating recompute. Direct taxi_drivers.UPDATE
--    from anonymous passengers is denied on purpose; the recompute is a
--    SECURITY DEFINER helper that guards who may call it.
-- NOTE: also see fix_infinite_recursion_profiles_taxi_orders migration.
CREATE OR REPLACE FUNCTION public.taxi_recompute_driver_rating(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_avg   numeric;
  v_count integer;
BEGIN
  IF v_uid IS NULL OR p_driver_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF NOT (
    is_admin()
    OR v_uid = p_driver_id
    OR EXISTS (
      SELECT 1 FROM public.taxi_orders o
      WHERE o.driver_id = p_driver_id
        AND o.passenger_id = v_uid
        AND o.status = 'completed'
    )
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0), COUNT(*)
    INTO v_avg, v_count
    FROM public.taxi_ratings
   WHERE to_id = p_driver_id;

  UPDATE public.taxi_drivers
     SET rating = v_avg, rating_count = v_count
   WHERE user_id = p_driver_id;

  RETURN jsonb_build_object('rating', v_avg, 'rating_count', v_count);
END $$;

REVOKE ALL ON FUNCTION public.taxi_recompute_driver_rating(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taxi_recompute_driver_rating(uuid) TO authenticated;