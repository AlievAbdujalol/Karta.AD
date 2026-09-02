-- Add status column to driver_routes for per-route moderation
ALTER TABLE public.driver_routes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_driver_routes_status
  ON public.driver_routes(status) WHERE status = 'approved';
