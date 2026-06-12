-- ═══════════════════════════════════════════════════════════
--  Таблица profiles
--  Запустить в: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════

-- 1. Создаём тип для роли (если ещё не существует)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Создаём таблицу profiles (если ещё не существует)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  photo_url   TEXT,
  phone       TEXT,
  bio         TEXT,
  role        user_role NOT NULL DEFAULT 'passenger',
  language    TEXT NOT NULL DEFAULT 'ru',
  city_id     UUID,
  vehicle_number TEXT,
  driver_status TEXT DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Обновляем updated_at автоматически
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Триггер автосоздания профиля при регистрации через Google / Email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, photo_url, role, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    'passenger',
    'ru'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. RLS — включаем защиту строк
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свой профиль
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Пользователь может обновлять только свой профиль
-- НО не может менять role на admin самостоятельно
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Запрещаем самоназначение admin через клиент
    -- Роль admin может назначить только service_role (через Supabase Dashboard)
    AND (
      role = (SELECT role FROM public.profiles WHERE id = auth.uid())
      OR role IN ('passenger', 'driver')
    )
  );

-- Вставка только через триггер (service_role)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 6. Индексы
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_city_id_idx ON public.profiles(city_id);

-- ═══════════════════════════════════════════════════════════
--  Готово! Теперь:
--  - При входе через Google профиль создаётся автоматически
--  - Роль по умолчанию: passenger
--  - Пользователь может выбрать: passenger или driver
--  - Роль admin назначается только через Supabase Dashboard
-- ═══════════════════════════════════════════════════════════
