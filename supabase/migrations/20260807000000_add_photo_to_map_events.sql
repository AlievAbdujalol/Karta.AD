ALTER TABLE public.map_events ADD COLUMN IF NOT EXISTS photo_url TEXT;
SELECT pg_notify('pgrst','reload schema');
