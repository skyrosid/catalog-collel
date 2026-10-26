-- Serialize this policy update with account creation and credential resets.
SELECT pg_advisory_xact_lock(197801, 1);

-- Existing collel administrators keep their current passwords and sessions.
UPDATE private.users u SET must_change_password = false
WHERE u.platform_role = 'member' AND u.must_change_password AND EXISTS (
  SELECT 1 FROM private.memberships m WHERE m.user_id = u.id AND m.role = 'admin'
);
CREATE OR REPLACE FUNCTION app.platform_create_collel(p_hash text, p_name text, p_slug text, p_admin_hash text, p_access_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid; v_access_id uuid; v_collel_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  INSERT INTO private.users (login, display_name, password_hash, must_change_password)
    VALUES ('admin-' || p_slug, p_name, p_admin_hash, false) RETURNING id INTO v_user_id;
  INSERT INTO private.users (login, display_name, password_hash)
    VALUES ('catalog-' || p_slug, p_name, p_access_hash) RETURNING id INTO v_access_id;
  INSERT INTO app.collels (name, slug, primary_admin_id, primary_access_id)
    VALUES (p_name, p_slug, v_user_id, v_access_id) RETURNING id INTO v_collel_id;
  INSERT INTO private.memberships (user_id, collel_id, role) VALUES (v_user_id, v_collel_id, 'admin');
  INSERT INTO private.memberships (user_id, collel_id, role) VALUES (v_access_id, v_collel_id, 'user');
  RETURN private.collel_summary(v_collel_id);
END
$$;

CREATE OR REPLACE FUNCTION app.platform_reset_admin(p_hash text, p_id uuid, p_password_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid; v_login text;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  SELECT primary_admin_id INTO v_user_id FROM app.collels WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0404'; END IF;
  UPDATE private.users SET password_hash = p_password_hash, must_change_password = false
    WHERE id = v_user_id RETURNING login INTO v_login;
  DELETE FROM private.sessions WHERE user_id = v_user_id;
  RETURN v_login;
END
$$;

