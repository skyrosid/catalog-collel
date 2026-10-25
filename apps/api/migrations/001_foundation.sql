-- Maintenance connection owns these objects; catalog_app must never own them.
CREATE SCHEMA private;
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO catalog_app;

CREATE TABLE app.collels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE CHECK (login = lower(btrim(login)) AND length(login) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.memberships (
  user_id uuid NOT NULL REFERENCES private.users(id) ON DELETE CASCADE,
  collel_id uuid NOT NULL REFERENCES app.collels(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  PRIMARY KEY (user_id, collel_id)
);
CREATE INDEX memberships_collel_idx ON private.memberships (collel_id, role);
CREATE TABLE private.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES private.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON private.sessions (user_id);
CREATE INDEX sessions_expiry_idx ON private.sessions (expires_at);

-- Identity and authorization tables have no direct runtime grants. Only the
-- bounded functions below can access them; they never expose password hashes
-- through an HTTP response. All SECURITY DEFINER search paths are fixed.
CREATE FUNCTION app.login_identity(p_login text)
RETURNS TABLE(id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.id, u.password_hash FROM private.users u
  WHERE u.login = p_login AND u.active
    AND EXISTS (SELECT 1 FROM private.memberships m WHERE m.user_id = u.id)
$$;

CREATE FUNCTION app.open_session(p_user_id uuid, p_hash text, p_hours integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_hours NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid session duration'; END IF;
  DELETE FROM private.sessions WHERE expires_at <= now();
  INSERT INTO private.sessions (token_hash, user_id, expires_at)
    SELECT p_hash, u.id, now() + make_interval(hours => p_hours)
    FROM private.users u WHERE u.id = p_user_id AND u.active;
END
$$;

CREATE FUNCTION app.close_session(p_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  DELETE FROM private.sessions WHERE token_hash = p_hash
$$;

CREATE FUNCTION app.session_info(p_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'user', jsonb_build_object('id', u.id, 'displayName', u.display_name),
    'memberships', (
      SELECT jsonb_agg(jsonb_build_object(
        'collelId', c.id, 'name', c.name, 'role', m.role
      ) ORDER BY c.name)
      FROM private.memberships m JOIN app.collels c ON c.id = m.collel_id
      WHERE m.user_id = u.id
    )
  )
  FROM private.sessions s JOIN private.users u ON u.id = s.user_id
  WHERE s.token_hash = p_hash AND s.expires_at > now() AND u.active
$$;

CREATE FUNCTION app.has_access(p_collel_id uuid, p_role text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.sessions s
    JOIN private.users u ON u.id = s.user_id
    JOIN private.memberships m ON m.user_id = u.id
    WHERE s.token_hash = nullif(current_setting('app.session_hash', true), '')
      AND s.expires_at > now() AND u.active AND m.collel_id = p_collel_id
      AND (p_role IS NULL OR m.role = p_role)
  )
$$;

ALTER TABLE app.collels ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.collels FORCE ROW LEVEL SECURITY;
CREATE POLICY collels_runtime ON app.collels FOR SELECT TO catalog_app
  USING (
    id = nullif(current_setting('app.collel_id', true), '')::uuid
    AND app.has_access(id)
  );
-- Explicit maintenance access also lets the fixed-owner session function return
-- only the caller's memberships. The server rejects this owner role at startup.
DO $$ BEGIN
  EXECUTE format('CREATE POLICY collels_maintenance ON app.collels TO %I USING (true) WITH CHECK (true)', current_user);
END $$;

-- Access mutations are infrequent. Serialize them to make the deferred
-- "at least one active administrator" invariant safe under concurrent edits.
CREATE FUNCTION private.lock_access_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  RETURN NULL;
END
$$;
CREATE FUNCTION private.check_access_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.collels c WHERE NOT EXISTS (
      SELECT 1 FROM private.memberships m JOIN private.users u ON u.id = m.user_id
      WHERE m.collel_id = c.id AND m.role = 'admin' AND u.active
    )
  ) THEN RAISE EXCEPTION 'Each collel requires an active administrator' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM private.users u WHERE NOT EXISTS (
      SELECT 1 FROM private.memberships m WHERE m.user_id = u.id
    )
  ) THEN RAISE EXCEPTION 'Each user requires a collel membership' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER lock_collels BEFORE INSERT OR UPDATE OR DELETE ON app.collels
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_access_changes();
CREATE TRIGGER lock_memberships BEFORE INSERT OR UPDATE OR DELETE ON private.memberships
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_access_changes();
CREATE TRIGGER lock_users BEFORE INSERT OR UPDATE OR DELETE ON private.users
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_access_changes();
CREATE CONSTRAINT TRIGGER check_collels AFTER INSERT OR UPDATE OR DELETE ON app.collels
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_access_invariants();
CREATE CONSTRAINT TRIGGER check_memberships AFTER INSERT OR UPDATE OR DELETE ON private.memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_access_invariants();
CREATE CONSTRAINT TRIGGER check_users AFTER INSERT OR UPDATE OR DELETE ON private.users
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_access_invariants();

REVOKE ALL ON ALL TABLES IN SCHEMA app, private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app, private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM catalog_app;
GRANT SELECT ON app.collels TO catalog_app;
GRANT EXECUTE ON FUNCTION app.login_identity(text), app.open_session(uuid, text, integer),
  app.close_session(text), app.session_info(text), app.has_access(uuid, text) TO catalog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, private REVOKE ALL ON TABLES FROM PUBLIC;
