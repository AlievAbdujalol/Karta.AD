-- Радикальное решение: удалить RLS на админских таблицах
-- так как авторизация уже происходит на уровне приложения

ALTER TABLE public.cities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules DISABLE ROW LEVEL SECURITY;
