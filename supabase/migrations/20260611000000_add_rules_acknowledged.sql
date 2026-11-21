-- Add rules_acknowledged flag to users table.
-- After completing the intake form the resident is shown the animated
-- house rules presentation. Once they sign acknowledgment at the end
-- this flag flips to true and they can proceed to the dashboard.
ALTER TABLE users ADD COLUMN IF NOT EXISTS rules_acknowledged boolean NOT NULL DEFAULT false;
