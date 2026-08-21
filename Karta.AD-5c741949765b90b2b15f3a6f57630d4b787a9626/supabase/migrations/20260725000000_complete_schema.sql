-- ============================================================================
-- COMPLETE SUPABASE SCHEMA FOR Karta.AD
-- Creates all tables, indexes, RLS policies, RPC functions, and storage.
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABLES ──────────────────────────────────────────────────────────────────

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    photo_url TEXT,
    role TEXT NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger', 'driver', 'admin', 'user')),
    driver_status TEXT DEFAULT 'pending' CHECK (driver_status IN ('pending', 'approved', 'blocked')),
    vehicle_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    phone TEXT,
    balance NUMERIC(12,2) DEFAULT 0 NOT NULL,
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'cancelled')),
    subscription_start_date TIMESTAMPTZ,
    subscription_next_billing TIMESTAMPTZ,
    subscription_paid_until TIMESTAMPTZ,
    bio TEXT,
    language TEXT DEFAULT 'ru',
    city_id UUID,
    admin_activated BOOLEAN DEFAULT false
);

-- 2. routes
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT NOT NULL,
    name TEXT,
    type TEXT CHECK (type IN ('bus', 'minibus')),
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    city_name TEXT,
    color TEXT DEFAULT '#1565C0',
    stops JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fare_bus NUMERIC(10,2),
    fare_minibus NUMERIC(10,2),
    price NUMERIC(10,2)
);

-- 3. cities
CREATE TABLE IF NOT EXISTS public.cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. vehicles
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    driver_name TEXT,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    route_number TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    is_active BOOLEAN DEFAULT false,
    speed DOUBLE PRECISION DEFAULT 0,
    last_updated TIMESTAMPTZ,
    vehicle_number TEXT,
    type TEXT CHECK (type IN ('bus', 'minibus')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. reviews
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    route_number TEXT,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    driver_name TEXT,
    vehicle_number TEXT,
    cleanliness INTEGER CHECK (cleanliness >= 1 AND cleanliness <= 5),
    politeness INTEGER CHECK (politeness >= 1 AND politeness <= 5),
    punctuality INTEGER CHECK (punctuality >= 1 AND punctuality <= 5),
    comment TEXT,
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. schedules
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    route_number TEXT,
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    stops_schedule JSONB DEFAULT '[]'::jsonb,
    price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. favorite_routes
CREATE TABLE IF NOT EXISTS public.favorite_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    route_number TEXT,
    route_name TEXT,
    route_type TEXT,
    city_name TEXT,
    route_color TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    type TEXT DEFAULT 'info',
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. transactions
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. trip_logs
CREATE TABLE IF NOT EXISTS public.trip_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    route_number TEXT,
    route_name TEXT,
    city_name TEXT,
    route_color TEXT,
    route_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. subscription_payments
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    role TEXT,
    payment_type TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. stops
CREATE TABLE IF NOT EXISTS public.stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. chats
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_one UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_two UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. reports
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. settings
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    notifications_enabled BOOLEAN DEFAULT true,
    language TEXT DEFAULT 'ru',
    theme TEXT DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TRIGGER: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER set_profiles_updated_at
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER set_settings_updated_at
        BEFORE UPDATE ON public.settings
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── TRIGGER: auto-create profile on signup ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, photo_url, role, language)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', ''),
        'passenger',
        'ru'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.settings (user_id, language)
    VALUES (NEW.id, 'ru')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── ENABLE RLS ──────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorite_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;

-- ─── HELPER FUNCTION (bypasses RLS to prevent infinite recursion) ────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────

-- Clean existing policies first
DO $$ DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id OR public.is_admin());

-- routes
CREATE POLICY "routes_select" ON public.routes FOR SELECT TO anon USING (true);
CREATE POLICY "routes_insert" ON public.routes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "routes_update" ON public.routes FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "routes_delete" ON public.routes FOR DELETE TO public USING (true);

-- cities
CREATE POLICY "cities_select" ON public.cities FOR SELECT TO anon USING (true);
CREATE POLICY "cities_insert" ON public.cities FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "cities_update" ON public.cities FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "cities_delete" ON public.cities FOR DELETE TO public USING (true);

-- vehicles
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT TO anon USING (true);
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id OR public.is_admin());
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE TO authenticated USING (auth.uid() = driver_id OR public.is_admin()) WITH CHECK (auth.uid() = driver_id OR public.is_admin());
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE TO authenticated USING (auth.uid() = driver_id OR public.is_admin());

-- reviews
CREATE POLICY "reviews_select" ON public.reviews FOR SELECT TO anon USING (true);
CREATE POLICY "reviews_insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by_id);
CREATE POLICY "reviews_update" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = created_by_id OR public.is_admin()) WITH CHECK (auth.uid() = created_by_id OR public.is_admin());
CREATE POLICY "reviews_delete" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = created_by_id OR public.is_admin());

-- schedules
CREATE POLICY "schedules_select" ON public.schedules FOR SELECT TO anon USING (true);
CREATE POLICY "schedules_insert" ON public.schedules FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "schedules_update" ON public.schedules FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "schedules_delete" ON public.schedules FOR DELETE TO public USING (true);

-- favorite_routes
CREATE POLICY "favorite_routes_select" ON public.favorite_routes FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "favorite_routes_insert" ON public.favorite_routes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "favorite_routes_update" ON public.favorite_routes FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "favorite_routes_delete" ON public.favorite_routes FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- notifications
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- transactions
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_admin());
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_admin()) WITH CHECK (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_admin());
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_admin());

-- trip_logs
CREATE POLICY "trip_logs_select" ON public.trip_logs FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "trip_logs_insert" ON public.trip_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_logs_update" ON public.trip_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "trip_logs_delete" ON public.trip_logs FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- subscription_payments
CREATE POLICY "subscription_payments_select" ON public.subscription_payments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "subscription_payments_insert" ON public.subscription_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscription_payments_update" ON public.subscription_payments FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "subscription_payments_delete" ON public.subscription_payments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- stops
CREATE POLICY "stops_select" ON public.stops FOR SELECT TO anon USING (true);
CREATE POLICY "stops_insert" ON public.stops FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "stops_update" ON public.stops FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "stops_delete" ON public.stops FOR DELETE TO public USING (true);

-- chats
CREATE POLICY "chats_select" ON public.chats FOR SELECT TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two);
CREATE POLICY "chats_insert" ON public.chats FOR INSERT TO authenticated WITH CHECK (auth.uid() = participant_one);
CREATE POLICY "chats_update" ON public.chats FOR UPDATE TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two) WITH CHECK (auth.uid() = participant_one OR auth.uid() = participant_two);
CREATE POLICY "chats_delete" ON public.chats FOR DELETE TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two);

-- messages
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.chats WHERE id = chat_id AND (auth.uid() = participant_one OR auth.uid() = participant_two)));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_update" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_delete" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- reports
CREATE POLICY "reports_select" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR auth.uid() = reported_user_id OR public.is_admin());
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_update" ON public.reports FOR UPDATE TO authenticated USING (auth.uid() = reporter_id OR public.is_admin()) WITH CHECK (auth.uid() = reporter_id OR public.is_admin());
CREATE POLICY "reports_delete" ON public.reports FOR DELETE TO authenticated USING (auth.uid() = reporter_id OR public.is_admin());

-- settings
CREATE POLICY "settings_select" ON public.settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "settings_insert" ON public.settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update" ON public.settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_delete" ON public.settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── PERFORMANCE INDEXES ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_city_id ON public.profiles(city_id);
CREATE INDEX IF NOT EXISTS idx_routes_city_id ON public.routes(city_id);
CREATE INDEX IF NOT EXISTS idx_routes_number ON public.routes(number);
CREATE INDEX IF NOT EXISTS idx_routes_type ON public.routes(type);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_route_id ON public.vehicles(route_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_lat_lng ON public.vehicles(lat, lng);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON public.vehicles(is_active);
CREATE INDEX IF NOT EXISTS idx_reviews_route_id ON public.reviews(route_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_by_id ON public.reviews(created_by_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_schedules_route_id ON public.schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_favorite_routes_user_id ON public.favorite_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_routes_route_id ON public.favorite_routes(route_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_sender_id ON public.transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recipient_id ON public.transactions(recipient_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_trip_logs_user_id ON public.trip_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_logs_route_id ON public.trip_logs(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_logs_created_at ON public.trip_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_id ON public.subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_stops_route_id ON public.stops(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_lat_lng ON public.stops(lat, lng);
CREATE INDEX IF NOT EXISTS idx_chats_participants ON public.chats(participant_one, participant_two);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON public.settings(user_id);

-- ─── RPC FUNCTIONS ───────────────────────────────────────────────────────────

-- create_payment: creates a transaction and deducts from passenger balance
CREATE OR REPLACE FUNCTION public.create_payment(driver_id UUID, amount NUMERIC)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    passenger_balance NUMERIC;
    transaction_id UUID;
BEGIN
    -- Get current user's balance
    SELECT balance INTO passenger_balance FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF passenger_balance < amount THEN
        RAISE EXCEPTION 'Insufficient balance: have %, need %', passenger_balance, amount;
    END IF;

    -- Deduct from passenger
    UPDATE public.profiles SET balance = balance - amount WHERE id = auth.uid();

    -- Create pending transaction
    INSERT INTO public.transactions (sender_id, recipient_id, amount, status)
    VALUES (auth.uid(), driver_id, amount, 'pending')
    RETURNING id INTO transaction_id;

    -- Notify driver
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
        driver_id,
        'Новый запрос на оплату',
        format('Пассажир запросил оплату %s TJS', amount::TEXT),
        'payment_pending',
        jsonb_build_object('transaction_id', transaction_id)
    );

    RETURN transaction_id;
END;
$$;

-- confirm_payment: driver confirms a pending payment
CREATE OR REPLACE FUNCTION public.confirm_payment(transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    tx_record RECORD;
BEGIN
    SELECT * INTO tx_record FROM public.transactions WHERE id = transaction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    IF tx_record.status != 'pending' THEN
        RAISE EXCEPTION 'Transaction is not pending';
    END IF;

    IF tx_record.recipient_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the recipient can confirm this payment';
    END IF;

    -- Add to driver's balance
    UPDATE public.profiles SET balance = balance + tx_record.amount WHERE id = tx_record.recipient_id;

    -- Mark transaction as completed
    UPDATE public.transactions SET status = 'completed' WHERE id = transaction_id;

    -- Notify passenger
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
        tx_record.sender_id,
        'Оплата подтверждена',
        format('Ваш платеж %s TJS подтвержден водителем', tx_record.amount::TEXT),
        'payment_confirmed',
        jsonb_build_object('transaction_id', transaction_id)
    );

    RETURN true;
END;
$$;

-- reject_payment: driver rejects a pending payment, refund passenger
CREATE OR REPLACE FUNCTION public.reject_payment(transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    tx_record RECORD;
BEGIN
    SELECT * INTO tx_record FROM public.transactions WHERE id = transaction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    IF tx_record.status != 'pending' THEN
        RAISE EXCEPTION 'Transaction is not pending';
    END IF;

    IF tx_record.recipient_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the recipient can reject this payment';
    END IF;

    -- Refund passenger
    UPDATE public.profiles SET balance = balance + tx_record.amount WHERE id = tx_record.sender_id;

    -- Mark transaction as cancelled
    UPDATE public.transactions SET status = 'cancelled' WHERE id = transaction_id;

    -- Notify passenger
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
        tx_record.sender_id,
        'Оплата отклонена',
        format('Водитель отклонил ваш платеж %s TJS. Средства возвращены.', tx_record.amount::TEXT),
        'payment_rejected',
        jsonb_build_object('transaction_id', transaction_id)
    );

    RETURN true;
END;
$$;

-- mock_top_up: simulate balance top-up (for demo)
CREATE OR REPLACE FUNCTION public.mock_top_up(amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles SET balance = balance + amount WHERE id = auth.uid();

    INSERT INTO public.transactions (sender_id, recipient_id, amount, status)
    VALUES (auth.uid(), NULL, amount, 'completed');

    RETURN true;
END;
$$;

-- protect_balance_update: prevent negative balance
CREATE OR REPLACE FUNCTION public.protect_balance_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.balance < 0 THEN
        RAISE EXCEPTION 'Balance cannot be negative';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    DROP TRIGGER IF EXISTS prevent_negative_balance ON public.profiles;
    CREATE TRIGGER prevent_negative_balance
        BEFORE UPDATE OF balance ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.protect_balance_update();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- activate_subscription: activate user subscription
DROP FUNCTION IF EXISTS public.activate_subscription(TEXT);
CREATE FUNCTION public.activate_subscription(user_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    fee NUMERIC;
    user_balance NUMERIC;
BEGIN
    IF user_role = 'driver' THEN
        fee := 20;
    ELSIF user_role = 'admin' THEN
        SELECT CASE WHEN admin_activated THEN 25 ELSE 100 END INTO fee
        FROM public.profiles WHERE id = auth.uid();
    ELSE
        RAISE EXCEPTION 'Invalid role for subscription';
    END IF;

    SELECT balance INTO user_balance FROM public.profiles WHERE id = auth.uid();
    IF user_balance < fee THEN
        RAISE EXCEPTION 'Insufficient balance: need %, have %', fee, user_balance;
    END IF;

    UPDATE public.profiles SET
        balance = balance - fee,
        subscription_status = 'active',
        subscription_start_date = COALESCE(subscription_start_date, now()),
        subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days',
        role = CASE WHEN user_role = 'admin' THEN 'admin' ELSE user_role END,
        admin_activated = CASE WHEN user_role = 'admin' THEN true ELSE admin_activated END
    WHERE id = auth.uid();

    INSERT INTO public.subscription_payments (user_id, amount, role, payment_type, status)
    VALUES (auth.uid(), fee, user_role, 'subscription', 'completed');

    RETURN true;
END;
$$;

-- renew_subscription: renew existing subscription
CREATE OR REPLACE FUNCTION public.renew_subscription()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    user_record RECORD;
    fee NUMERIC;
BEGIN
    SELECT * INTO user_record FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF user_record.role = 'driver' THEN
        fee := 20;
    ELSIF user_record.role = 'admin' THEN
        fee := 25;
    ELSE
        RAISE EXCEPTION 'Subscription not applicable for passenger role';
    END IF;

    IF user_record.balance < fee THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE public.profiles SET
        balance = balance - fee,
        subscription_paid_until = GREATEST(
            COALESCE(subscription_paid_until, now()),
            now()
        ) + INTERVAL '30 days',
        subscription_status = 'active'
    WHERE id = auth.uid();

    INSERT INTO public.subscription_payments (user_id, amount, role, payment_type, status)
    VALUES (auth.uid(), fee, user_record.role, 'renewal', 'completed');

    RETURN true;
END;
$$;

-- ─── REALTIME PUBLICATION ────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stops;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── STORAGE BUCKETS ─────────────────────────────────────────────────────────

-- Create buckets if they don't exist (handled via SQL function)
CREATE OR REPLACE FUNCTION public.create_storage_buckets()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- avatars bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'avatars',
        'avatars',
        true,
        5242880, -- 5MB
        ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
    )
    ON CONFLICT (id) DO NOTHING;

    -- documents bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'documents',
        'documents',
        false,
        10485760, -- 10MB
        ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    )
    ON CONFLICT (id) DO NOTHING;

    -- route-images bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'route-images',
        'route-images',
        true,
        10485760, -- 10MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
    ON CONFLICT (id) DO NOTHING;

    -- reports bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'reports',
        'reports',
        false,
        20971520, -- 20MB
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
    )
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Storage RLS Policies
-- avatars: public read, authenticated upload/update/delete own
CREATE POLICY "avatars_select" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- documents: authenticated read own, admin read all
CREATE POLICY "documents_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY "documents_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- route-images: public read, admin upload
CREATE POLICY "route_images_select" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'route-images');
CREATE POLICY "route_images_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'route-images' AND public.is_admin());
CREATE POLICY "route_images_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'route-images' AND public.is_admin()) WITH CHECK (bucket_id = 'route-images' AND public.is_admin());
CREATE POLICY "route_images_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'route-images' AND public.is_admin());

-- reports: upload own, admin read all
CREATE POLICY "reports_select_storage" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reports' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY "reports_insert_storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "reports_update_storage" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "reports_delete_storage" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── DATA API ACCESS (expose tables to REST API) ─────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ─── SCHEMA CACHE REFRESH ────────────────────────────────────────────────────

SELECT pg_notify('pgrst', 'reload schema');
