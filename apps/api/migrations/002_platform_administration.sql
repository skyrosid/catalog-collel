-- Upgrade existing installations without replacing the first migration.
ALTER TABLE private.users ADD COLUMN platform_role text NOT NULL DEFAULT 'member'
  CHECK (platform_role IN ('member', 'super_admin'));
ALTER TABLE private.users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE app.collels ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE app.collels ADD COLUMN primary_admin_id uuid
  REFERENCES private.users(id) DEFERRABLE INITIALLY DEFERRED;
UPDATE app.collels c SET primary_admin_id = (
  SELECT m.user_id FROM private.memberships m JOIN private.users u ON u.id = m.user_id
  WHERE m.collel_id = c.id AND m.role = 'admin' AND u.active ORDER BY u.created_at, u.id LIMIT 1
);
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE app.collels ALTER COLUMN primary_admin_id SET NOT NULL;
ALTER TABLE app.collels ADD COLUMN primary_access_id uuid
  REFERENCES private.users(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE private.device_activations (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES private.users(id) ON DELETE CASCADE,
  collel_id uuid NOT NULL REFERENCES app.collels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_activations_user_idx ON private.device_activations(user_id);
ALTER TABLE private.sessions ADD COLUMN device_hash text
  REFERENCES private.device_activations(token_hash) ON DELETE CASCADE;
SET CONSTRAINTS ALL DEFERRED;

CREATE TABLE private.platform_setup (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  initialized boolean NOT NULL DEFAULT false
);
INSERT INTO private.platform_setup DEFAULT VALUES;

CREATE OR REPLACE FUNCTION private.check_access_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.collels c WHERE NOT EXISTS (
      SELECT 1 FROM private.memberships m JOIN private.users u ON u.id = m.user_id
      WHERE m.collel_id = c.id AND m.role = 'admin' AND u.active
    )
  ) THEN RAISE EXCEPTION 'Each collel requires an active administrator' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM app.collels c WHERE NOT EXISTS (
      SELECT 1 FROM private.memberships m JOIN private.users u ON u.id = m.user_id
      WHERE m.collel_id = c.id AND m.user_id = c.primary_admin_id AND m.role = 'admin'
        AND u.active AND u.platform_role = 'member'
    )
  ) THEN RAISE EXCEPTION 'Each collel requires a valid primary administrator' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM app.collels c WHERE c.primary_access_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM private.memberships m JOIN private.users u ON u.id = m.user_id
      WHERE m.collel_id = c.id AND m.user_id = c.primary_access_id AND m.role = 'user'
        AND u.active AND u.platform_role = 'member'
    )
  ) THEN RAISE EXCEPTION 'Invalid catalogue access identity' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM private.users u WHERE u.platform_role = 'member' AND NOT EXISTS (
      SELECT 1 FROM private.memberships m WHERE m.user_id = u.id
    )
  ) THEN RAISE EXCEPTION 'Each user requires a collel membership' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM private.users u JOIN private.memberships m ON m.user_id = u.id
    WHERE u.platform_role = 'super_admin'
  ) THEN RAISE EXCEPTION 'Platform identities cannot have tenant memberships' USING ERRCODE = '23514'; END IF;
  IF (SELECT initialized FROM private.platform_setup) AND NOT EXISTS (
    SELECT 1 FROM private.users WHERE platform_role = 'super_admin' AND active
  ) THEN RAISE EXCEPTION 'An active super administrator is required' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION app.login_identity(p_login text)
RETURNS TABLE(id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.id, u.password_hash FROM private.users u
  WHERE u.login = p_login AND u.active AND (
    u.platform_role = 'super_admin' OR EXISTS (
      SELECT 1 FROM private.memberships m JOIN app.collels c ON c.id = m.collel_id
      WHERE m.user_id = u.id AND c.active
    )
  )
$$;
CREATE OR REPLACE FUNCTION app.session_info(p_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'user', jsonb_build_object('id', u.id, 'displayName', u.display_name,
      'platformRole', u.platform_role, 'mustChangePassword', u.must_change_password),
    'memberships', coalesce((
      SELECT jsonb_agg(jsonb_build_object('collelId', c.id, 'name', c.name, 'role', m.role) ORDER BY c.name)
      FROM private.memberships m JOIN app.collels c ON c.id = m.collel_id
      WHERE m.user_id = u.id AND c.active
    ), '[]'::jsonb)
  ) FROM private.sessions s JOIN private.users u ON u.id = s.user_id
  WHERE s.token_hash = p_hash AND s.expires_at > now() AND u.active
$$;
CREATE OR REPLACE FUNCTION app.has_access(p_collel_id uuid, p_role text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.sessions s JOIN private.users u ON u.id = s.user_id
    JOIN private.memberships m ON m.user_id = u.id JOIN app.collels c ON c.id = m.collel_id
    WHERE s.token_hash = nullif(current_setting('app.session_hash', true), '')
      AND s.expires_at > now() AND u.active AND NOT u.must_change_password
      AND c.active AND m.collel_id = p_collel_id AND (p_role IS NULL OR m.role = p_role)
  )
$$;

CREATE FUNCTION app.setup_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('required', NOT initialized) FROM private.platform_setup
$$;
CREATE FUNCTION app.create_first_superadmin(p_login text, p_password_hash text, p_hash text, p_hours integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  UPDATE private.platform_setup SET initialized = true WHERE singleton AND NOT initialized;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setup complete' USING ERRCODE = 'P0409'; END IF;
  INSERT INTO private.users (login, display_name, password_hash, platform_role)
    VALUES (p_login, p_login, p_password_hash, 'super_admin') RETURNING id INTO v_user_id;
  PERFORM app.open_session(v_user_id, p_hash, p_hours);
  RETURN app.session_info(p_hash);
END
$$;

CREATE FUNCTION private.require_superadmin(p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id FROM private.sessions s JOIN private.users u ON u.id = s.user_id
  WHERE s.token_hash = p_hash AND s.expires_at > now() AND u.active
    AND u.platform_role = 'super_admin' AND NOT u.must_change_password;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'P0403'; END IF;
  RETURN v_user_id;
END
$$;
CREATE FUNCTION private.collel_summary(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'active', c.active,
    'admin', jsonb_build_object('login', u.login, 'displayName', u.display_name),
    'access', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('login', a.login) END)
  FROM app.collels c JOIN private.users u ON u.id = c.primary_admin_id
  LEFT JOIN private.users a ON a.id = c.primary_access_id WHERE c.id = p_id
$$;
CREATE FUNCTION app.platform_collels(p_hash text, p_search text, p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.require_superadmin(p_hash);
  IF p_page < 0 OR p_page > 100000 OR length(p_search) > 100 THEN
    RAISE EXCEPTION 'Invalid query' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(private.collel_summary(c.id) ORDER BY c.created_at DESC, c.id)
      FROM (SELECT * FROM app.collels
        WHERE strpos(lower(name || ' ' || slug), lower(p_search)) > 0
        ORDER BY created_at DESC, id LIMIT 20 OFFSET p_page * 20) c), '[]'::jsonb),
    'total', (SELECT count(*) FROM app.collels WHERE strpos(lower(name || ' ' || slug), lower(p_search)) > 0)
  );
END
$$;
CREATE FUNCTION app.platform_create_collel(p_hash text, p_name text, p_slug text, p_admin_hash text, p_access_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid; v_access_id uuid; v_collel_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  INSERT INTO private.users (login, display_name, password_hash, must_change_password)
    VALUES ('admin-' || p_slug, p_name, p_admin_hash, true) RETURNING id INTO v_user_id;
  INSERT INTO private.users (login, display_name, password_hash)
    VALUES ('catalog-' || p_slug, p_name, p_access_hash) RETURNING id INTO v_access_id;
  INSERT INTO app.collels (name, slug, primary_admin_id, primary_access_id)
    VALUES (p_name, p_slug, v_user_id, v_access_id) RETURNING id INTO v_collel_id;
  INSERT INTO private.memberships (user_id, collel_id, role) VALUES (v_user_id, v_collel_id, 'admin');
  INSERT INTO private.memberships (user_id, collel_id, role) VALUES (v_access_id, v_collel_id, 'user');
  RETURN private.collel_summary(v_collel_id);
END
$$;
CREATE FUNCTION app.platform_reset_access(p_hash text, p_id uuid, p_password_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_collel app.collels; v_user_id uuid; v_login text;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  SELECT * INTO v_collel FROM app.collels WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0404'; END IF;
  v_user_id := v_collel.primary_access_id;
  IF v_user_id IS NULL THEN
    INSERT INTO private.users (login, display_name, password_hash)
      VALUES ('catalog-' || v_collel.slug, v_collel.name, p_password_hash)
      RETURNING id, login INTO v_user_id, v_login;
    UPDATE app.collels SET primary_access_id = v_user_id WHERE id = p_id;
    INSERT INTO private.memberships VALUES (v_user_id, p_id, 'user');
  ELSE
    UPDATE private.users SET password_hash = p_password_hash WHERE id = v_user_id RETURNING login INTO v_login;
    DELETE FROM private.device_activations WHERE user_id = v_user_id;
    DELETE FROM private.sessions WHERE user_id = v_user_id;
  END IF;
  RETURN v_login;
END
$$;
CREATE FUNCTION app.activate_device(p_session text, p_device text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid; v_collel_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  SELECT u.id, c.id INTO v_user_id, v_collel_id
  FROM private.sessions s JOIN private.users u ON u.id = s.user_id
  JOIN app.collels c ON c.primary_access_id = u.id
  WHERE s.token_hash = p_session AND s.expires_at > now() AND u.active AND c.active
    AND u.platform_role = 'member' AND NOT u.must_change_password;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'P0403'; END IF;
  INSERT INTO private.device_activations(token_hash, user_id, collel_id) VALUES (p_device, v_user_id, v_collel_id);
  UPDATE private.sessions SET device_hash = p_device WHERE token_hash = p_session;
END
$$;
CREATE FUNCTION app.resume_device(p_device text, p_session text, p_hours integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  SELECT d.user_id INTO v_user_id FROM private.device_activations d
  JOIN private.users u ON u.id = d.user_id JOIN app.collels c ON c.id = d.collel_id
  WHERE d.token_hash = p_device AND u.active AND c.active AND c.primary_access_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'P0401'; END IF;
  PERFORM app.open_session(v_user_id, p_session, p_hours);
  UPDATE private.sessions SET device_hash = p_device WHERE token_hash = p_session;
  UPDATE private.device_activations SET last_used_at = now() WHERE token_hash = p_device;
  RETURN app.session_info(p_session);
END
$$;
CREATE FUNCTION app.revoke_device(p_device text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  DELETE FROM private.device_activations WHERE token_hash = p_device
$$;
CREATE FUNCTION app.platform_update_collel(p_hash text, p_id uuid, p_name text, p_slug text, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  UPDATE app.collels SET name = p_name, slug = p_slug, active = p_active WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0404'; END IF;
  RETURN private.collel_summary(p_id);
END
$$;
CREATE FUNCTION app.platform_reset_admin(p_hash text, p_id uuid, p_password_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid; v_login text;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  SELECT primary_admin_id INTO v_user_id FROM app.collels WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0404'; END IF;
  UPDATE private.users SET password_hash = p_password_hash, must_change_password = true
    WHERE id = v_user_id RETURNING login INTO v_login;
  DELETE FROM private.sessions WHERE user_id = v_user_id;
  RETURN v_login;
END
$$;
CREATE FUNCTION app.session_password_hash(p_hash text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.password_hash FROM private.sessions s JOIN private.users u ON u.id = s.user_id
  WHERE s.token_hash = p_hash AND s.expires_at > now() AND u.active
$$;
CREATE FUNCTION app.change_password(p_hash text, p_expected_hash text, p_new_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  UPDATE private.users u SET password_hash = p_new_hash, must_change_password = false
    FROM private.sessions s WHERE s.user_id = u.id AND s.token_hash = p_hash
      AND s.expires_at > now() AND u.active AND u.password_hash = p_expected_hash
    RETURNING u.id INTO v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'P0401'; END IF;
  DELETE FROM private.sessions WHERE user_id = v_user_id AND token_hash <> p_hash;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, catalog_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, catalog_app;
REVOKE ALL ON FUNCTION app.setup_status(), app.create_first_superadmin(text,text,text,integer),
  app.platform_collels(text,text,integer), app.platform_create_collel(text,text,text,text,text),
  app.platform_update_collel(text,uuid,text,text,boolean), app.platform_reset_admin(text,uuid,text),
  app.session_password_hash(text), app.change_password(text,text,text), app.platform_reset_access(text,uuid,text),
  app.activate_device(text,text), app.resume_device(text,text,integer), app.revoke_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.setup_status(), app.create_first_superadmin(text,text,text,integer),
  app.platform_collels(text,text,integer), app.platform_create_collel(text,text,text,text,text),
  app.platform_update_collel(text,uuid,text,text,boolean), app.platform_reset_admin(text,uuid,text),
  app.session_password_hash(text), app.change_password(text,text,text), app.platform_reset_access(text,uuid,text),
  app.activate_device(text,text), app.resume_device(text,text,integer), app.revoke_device(text) TO catalog_app;
