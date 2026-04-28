-- Migration: Assign all existing data to a default "Sober Living" workspace.
-- Safe to run on a production database — only fills in NULL workspace_id values.

DO $$
DECLARE
  ws_id uuid;
  owner_uid uuid;
BEGIN
  -- Find the owner: first admin user by creation date
  SELECT u.id INTO owner_uid
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  WHERE ur.role = 'admin'
  ORDER BY u.created_at ASC
  LIMIT 1;

  -- If no admin exists, use the very first user
  IF owner_uid IS NULL THEN
    SELECT id INTO owner_uid FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- If there are no users at all, skip the migration
  IF owner_uid IS NULL THEN
    RAISE NOTICE 'No users found — skipping workspace migration.';
    RETURN;
  END IF;

  -- Create the default workspace
  INSERT INTO workspaces (name, slug, owner_id)
  VALUES ('Sober Living', 'sober-living', owner_uid)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO ws_id;

  -- If slug already existed, fetch the existing workspace id
  IF ws_id IS NULL THEN
    SELECT id INTO ws_id FROM workspaces WHERE slug = 'sober-living';
  END IF;

  -- Assign all users without a workspace to this workspace
  UPDATE users SET workspace_id = ws_id WHERE workspace_id IS NULL;

  -- Assign all houses without a workspace to this workspace
  UPDATE houses SET workspace_id = ws_id WHERE workspace_id IS NULL;

  -- Create workspace_members rows for all users that don't already have one.
  -- Map their existing user_roles to workspace roles.
  INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT ws_id, u.id,
    CASE
      WHEN ur.role = 'admin' THEN 'owner'
      WHEN ur.role = 'manager' THEN 'admin'
      ELSE 'resident'
    END
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.user_id = u.id AND wm.workspace_id = ws_id
  );

  -- Make sure the owner is set to 'owner' role
  UPDATE workspace_members
  SET role = 'owner'
  WHERE workspace_id = ws_id AND user_id = owner_uid;

  -- Ensure workspace_settings exist
  INSERT INTO workspace_settings (workspace_id)
  VALUES (ws_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  -- Ensure workspace_payment_config exists
  INSERT INTO workspace_payment_config (workspace_id)
  VALUES (ws_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  RAISE NOTICE 'Migrated existing data to workspace % (id: %)', 'Sober Living', ws_id;
END;
$$;
