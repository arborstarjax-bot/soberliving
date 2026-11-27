-- Add default_weekly_rent_amount column to workspace_payment_config
-- so admins can set separate weekly and monthly default rent prices.
ALTER TABLE workspace_payment_config
  ADD COLUMN IF NOT EXISTS default_weekly_rent_amount numeric(10,2) DEFAULT 0 NOT NULL;
