-- ============================================================================
-- TAXI MODULE SCHEMA FOR Karta.AD
-- Tables, RLS, RPC for taxi service (ride-hailing)
-- ============================================================================

-- ─── EXTEND PROFILES ──────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('passenger', 'driver', 'admin', 'user', 'taxi_driver'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_driver_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_driver_status_check
  CHECK (driver_status IN ('pending', 'approved', 'blocked', 'documents_required'));

-- ─── TAXI VEHICLES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    color TEXT,
    plate_number TEXT NOT NULL,
    vin TEXT,
    seats INTEGER DEFAULT 4,
    body_type TEXT,
    category TEXT NOT NULL DEFAULT 'economy'
      CHECK (category IN ('economy','comfort','comfort_plus','minivan','business','electric','women','cargo')),
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_vehicles_driver ON public.taxi_vehicles(driver_id);

-- ─── TAXI DRIVERS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    photo_url TEXT,
    city TEXT,
    status TEXT NOT NULL DEFAULT 'offline'
      CHECK (status IN ('offline','online','free','assigned','en_route','arrived','riding','waiting','completed','cancelled')),
    rating NUMERIC(3,2) DEFAULT 5.0,
    rides_count INTEGER DEFAULT 0,
    total_earnings NUMERIC(12,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    bank_details JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_online_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_taxi_drivers_user ON public.taxi_drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_taxi_drivers_status ON public.taxi_drivers(status);

-- ─── DRIVER DOCUMENTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    license_photo_url TEXT,
    tech_passport_url TEXT,
    insurance_url TEXT,
    license_number TEXT,
    license_expiry DATE,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_docs_driver ON public.taxi_driver_documents(driver_id);

-- ─── DRIVER LOCATIONS (REALTIME) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_driver_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'offline',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_loc_driver ON public.taxi_driver_locations(driver_id);

-- Enable realtime for location updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_driver_locations;

-- ─── TAXI ORDERS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID NOT NULL REFERENCES auth.users(id),
    driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'searching'
      CHECK (status IN ('searching','found','en_route','arrived','riding','completed','cancelled')),
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    pickup_address TEXT,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lng DOUBLE PRECISION,
    dropoff_address TEXT,
    waypoints JSONB DEFAULT '[]'::jsonb,
    category TEXT NOT NULL DEFAULT 'economy',
    distance_km NUMERIC(8,2),
    duration_min NUMERIC(8,2),
    price NUMERIC(10,2),
    currency TEXT DEFAULT 'TJS',
    payment_method TEXT DEFAULT 'cash'
      CHECK (payment_method IN ('cash','card','qr','wallet')),
    passengers_count INTEGER DEFAULT 1,
    has_luggage BOOLEAN DEFAULT false,
    child_seat BOOLEAN DEFAULT false,
    pets_allowed BOOLEAN DEFAULT false,
    has_ac BOOLEAN DEFAULT true,
    no_smoking BOOLEAN DEFAULT true,
    comment TEXT,
    rating_given BOOLEAN DEFAULT false,
    cancelled_by TEXT,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_orders_passenger ON public.taxi_orders(passenger_id);
CREATE INDEX IF NOT EXISTS idx_taxi_orders_driver ON public.taxi_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_taxi_orders_status ON public.taxi_orders(status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_orders;

-- ─── RIDE EVENTS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_ride_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.taxi_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_events_order ON public.taxi_ride_events(order_id);

-- ─── RIDE MESSAGES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_ride_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.taxi_orders(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_messages_order ON public.taxi_ride_messages(order_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_ride_messages;

-- ─── RIDE PAYMENTS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_ride_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.taxi_orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    commission NUMERIC(10,2) DEFAULT 0,
    driver_earnings NUMERIC(10,2) DEFAULT 0,
    method TEXT DEFAULT 'cash',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','refunded','failed')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RATINGS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.taxi_orders(id) ON DELETE CASCADE,
    from_id UUID NOT NULL REFERENCES auth.users(id),
    to_id UUID NOT NULL REFERENCES auth.users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    tip NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_ratings_to ON public.taxi_ratings(to_id);

-- ─── FAVORITE ADDRESSES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_favorite_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    type TEXT DEFAULT 'other' CHECK (type IN ('home','work','other')),
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_fav_user ON public.taxi_favorite_addresses(user_id);

-- ─── EMERGENCY CONTACTS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT,
    notify_on_ride BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_emergency_user ON public.taxi_emergency_contacts(user_id);

-- ─── PROMOTIONS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
    discount_value NUMERIC(10,2) NOT NULL,
    min_order_amount NUMERIC(10,2) DEFAULT 0,
    max_uses INTEGER DEFAULT 100,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DRIVER WALLET ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earnings','withdrawal','bonus','commission','refund')),
    order_id UUID REFERENCES public.taxi_orders(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_wallet_driver ON public.taxi_wallet_transactions(driver_id);

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────

ALTER TABLE public.taxi_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_ride_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_ride_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_ride_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_favorite_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_promotions ENABLE ROW LEVEL SECURITY;

-- Read all: authenticated users can view driver locations and profiles
CREATE POLICY "taxi_locations_read_all" ON public.taxi_driver_locations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "taxi_locations_write_own" ON public.taxi_driver_locations
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "taxi_locations_update_own" ON public.taxi_driver_locations
  FOR UPDATE USING (auth.uid() = driver_id);

CREATE POLICY "taxi_drivers_read_all" ON public.taxi_drivers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "taxi_drivers_write_own" ON public.taxi_drivers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "taxi_drivers_update_own" ON public.taxi_drivers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "taxi_vehicles_read_all" ON public.taxi_vehicles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "taxi_vehicles_write_own" ON public.taxi_vehicles
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "taxi_vehicles_update_own" ON public.taxi_vehicles
  FOR UPDATE USING (auth.uid() = driver_id);

-- Orders: passenger sees own, driver sees assigned
CREATE POLICY "taxi_orders_select" ON public.taxi_orders
  FOR SELECT USING (
    auth.uid() = passenger_id OR
    auth.uid() = driver_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "taxi_orders_insert" ON public.taxi_orders
  FOR INSERT WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "taxi_orders_update" ON public.taxi_orders
  FOR UPDATE USING (
    auth.uid() = passenger_id OR
    auth.uid() = driver_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: participants can read/write
CREATE POLICY "taxi_messages_select" ON public.taxi_ride_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.taxi_orders o
      WHERE o.id = order_id AND (o.passenger_id = auth.uid() OR o.driver_id = auth.uid()))
  );

CREATE POLICY "taxi_messages_insert" ON public.taxi_ride_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM public.taxi_orders o
      WHERE o.id = order_id AND (o.passenger_id = auth.uid() OR o.driver_id = auth.uid()))
  );

-- Ratings: anyone can read, only participants can write
CREATE POLICY "taxi_ratings_select" ON public.taxi_ratings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "taxi_ratings_insert" ON public.taxi_ratings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.taxi_orders o
      WHERE o.id = order_id AND (o.passenger_id = auth.uid() OR o.driver_id = auth.uid()))
  );

-- Favorite addresses: user's own
CREATE POLICY "taxi_fav_select" ON public.taxi_favorite_addresses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "taxi_fav_insert" ON public.taxi_favorite_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "taxi_fav_update" ON public.taxi_favorite_addresses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "taxi_fav_delete" ON public.taxi_favorite_addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Promotions: authenticated can read active promos
CREATE POLICY "taxi_promo_select" ON public.taxi_promotions
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- Emergency contacts: user's own
CREATE POLICY "taxi_emergency_select" ON public.taxi_emergency_contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "taxi_emergency_insert" ON public.taxi_emergency_contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── STORAGE BUCKETS ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES ('taxi_docs', 'taxi_docs', false)
ON CONFLICT (id) DO NOTHING;

-- ─── RPC FUNCTIONS ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_nearby_taxi_drivers(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 5,
    p_category TEXT DEFAULT NULL
) RETURNS TABLE(
    driver_id UUID,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    category TEXT,
    rating NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.user_id,
        l.lat,
        l.lng,
        l.heading,
        (6371 * acos(
            cos(radians(p_lat)) * cos(radians(l.lat)) *
            cos(radians(l.lng) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(l.lat))
        ))::DOUBLE PRECISION AS distance_km,
        v.category,
        d.rating
    FROM public.taxi_driver_locations l
    JOIN public.taxi_drivers d ON d.user_id = l.driver_id
    LEFT JOIN public.taxi_vehicles v ON v.driver_id = d.user_id
    WHERE l.status = 'free'
      AND d.status = 'online'
      AND d.is_verified = true
      AND (p_category IS NULL OR v.category = p_category)
    HAVING distance_km <= p_radius_km
    ORDER BY distance_km;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_taxi_price(
    p_distance_km DOUBLE PRECISION,
    p_duration_min DOUBLE PRECISION,
    p_category TEXT DEFAULT 'economy',
    p_night BOOLEAN DEFAULT false
) RETURNS NUMERIC(10,2) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    base_price NUMERIC(10,2);
    per_km NUMERIC(10,2);
    per_min NUMERIC(10,2);
    min_price NUMERIC(10,2);
    night_coef NUMERIC(3,2);
    total NUMERIC(10,2);
BEGIN
    base_price := CASE p_category
        WHEN 'economy' THEN 5.00
        WHEN 'comfort' THEN 8.00
        WHEN 'comfort_plus' THEN 12.00
        WHEN 'minivan' THEN 15.00
        WHEN 'business' THEN 20.00
        WHEN 'electric' THEN 7.00
        WHEN 'women' THEN 6.00
        WHEN 'cargo' THEN 18.00
        ELSE 5.00
    END;
    per_km := CASE p_category
        WHEN 'economy' THEN 1.50
        WHEN 'comfort' THEN 2.00
        WHEN 'comfort_plus' THEN 2.50
        WHEN 'minivan' THEN 2.80
        WHEN 'business' THEN 3.50
        WHEN 'electric' THEN 1.60
        WHEN 'women' THEN 1.80
        WHEN 'cargo' THEN 3.00
        ELSE 1.50
    END;
    per_min := 0.30;
    min_price := CASE p_category
        WHEN 'economy' THEN 7.00
        WHEN 'comfort' THEN 10.00
        WHEN 'comfort_plus' THEN 15.00
        WHEN 'minivan' THEN 18.00
        WHEN 'business' THEN 25.00
        WHEN 'electric' THEN 8.00
        WHEN 'women' THEN 8.00
        WHEN 'cargo' THEN 20.00
        ELSE 7.00
    END;
    night_coef := CASE WHEN p_night THEN 1.5 ELSE 1.0 END;
    total := (base_price + (per_km * p_distance_km) + (per_min * p_duration_min)) * night_coef;
    IF total < min_price THEN total := min_price; END IF;
    RETURN ROUND(total, 2);
END;
$$;
