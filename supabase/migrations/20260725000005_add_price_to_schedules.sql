-- Добавляем колонку price для расписания
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);
