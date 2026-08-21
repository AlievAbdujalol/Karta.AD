-- Добавляем колонку price для маршрутов
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);
