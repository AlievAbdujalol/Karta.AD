-- ============================================================
-- Karta-AD Business — Phase 1: foundation
-- Spec: KARTA_AD_BUSINESS_SPEC.md §13 (database), §14 (RLS), §15 (roles), §51 (Phase 1)
-- - businesses: бизнес-сущность, изоляция по business_id
-- - business_members: роли owner/manager/employee/courier
-- - business_role(): SECURITY DEFINER helper для RLS (без рекурсии)
-- - create_business(): создание бизнеса + membership владельца одной транзакцией
-- - get_my_businesses(): список бизнесов текущего пользователя
-- Applied: 2026-09-27
-- ============================================================

-- ─── businesses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  description TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_id);

-- ─── business_members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'manager', 'employee', 'courier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_members_user ON public.business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_members_business ON public.business_members(business_id);

-- ─── helper: роль пользователя в бизнесе (NULL если не участник) ────────────
CREATE OR REPLACE FUNCTION public.business_role(p_business_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bm.role
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id
    AND bm.user_id = auth.uid()
  LIMIT 1
$$;

-- ─── updated_at trigger ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_businesses_updated_at ON public.businesses;
CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "businesses_select" ON public.businesses
    FOR SELECT TO authenticated
    USING (public.business_role(id) IS NOT NULL OR public.is_admin());

  CREATE POLICY "businesses_insert" ON public.businesses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

  CREATE POLICY "businesses_update" ON public.businesses
    FOR UPDATE TO authenticated
    USING (public.business_role(id) IN ('owner', 'manager') OR public.is_admin())
    WITH CHECK (public.business_role(id) IN ('owner', 'manager') OR public.is_admin());

  CREATE POLICY "businesses_delete" ON public.businesses
    FOR DELETE TO authenticated
    USING (public.business_role(id) = 'owner' OR public.is_admin());

  CREATE POLICY "business_members_select" ON public.business_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

  CREATE POLICY "business_members_insert" ON public.business_members
    FOR INSERT TO authenticated
    WITH CHECK (
      public.business_role(business_id) IN ('owner', 'manager')
      OR auth.uid() = (SELECT b.owner_id FROM public.businesses b WHERE b.id = business_id)
      OR public.is_admin()
    );

  CREATE POLICY "business_members_update" ON public.business_members
    FOR UPDATE TO authenticated
    USING (public.business_role(business_id) IN ('owner', 'manager') OR public.is_admin())
    WITH CHECK (public.business_role(business_id) IN ('owner', 'manager') OR public.is_admin());

  CREATE POLICY "business_members_delete" ON public.business_members
    FOR DELETE TO authenticated
    USING (public.business_role(business_id) IN ('owner', 'manager') OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── create_business: бизнес + membership владельца одной транзакцией ──────
CREATE OR REPLACE FUNCTION public.create_business(
  p_name TEXT,
  p_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.businesses (owner_id, name, type, description, city, address, phone)
  VALUES (auth.uid(), p_name, p_type, p_description, p_city, p_address, p_phone)
  RETURNING id INTO v_id;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_business(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── get_my_businesses: список бизнесов текущего пользователя ───────────────
CREATE OR REPLACE FUNCTION public.get_my_businesses()
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  description TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  status TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.type, b.description, b.city, b.address, b.phone, b.logo_url, b.status, bm.role, b.created_at
  FROM public.businesses b
  JOIN public.business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_businesses() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
