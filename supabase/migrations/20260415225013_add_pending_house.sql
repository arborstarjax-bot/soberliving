-- Add pending_house_id to users table so admins can pre-assign a house during invite.
-- The intake review page uses this to route applications to the correct manager.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pending_house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL;
