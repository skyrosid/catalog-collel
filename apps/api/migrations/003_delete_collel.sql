CREATE FUNCTION app.platform_delete_collel(p_hash text, p_id uuid, p_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_slug text; v_users uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(197801, 1);
  PERFORM private.require_superadmin(p_hash);
  SELECT slug INTO v_slug FROM app.collels WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0404'; END IF;
  IF v_slug IS DISTINCT FROM p_slug THEN
    RAISE EXCEPTION 'Confirmation does not match' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(user_id) INTO v_users FROM private.memberships WHERE collel_id = p_id;
  -- Cascading foreign keys revoke this collel's memberships and device activations.
  DELETE FROM app.collels WHERE id = p_id;
  -- An identity authorized for another collel must be preserved.
  DELETE FROM private.users u WHERE u.id = ANY(v_users) AND u.platform_role = 'member'
    AND NOT EXISTS (SELECT 1 FROM private.memberships m WHERE m.user_id = u.id);
END
$$;
REVOKE ALL ON FUNCTION app.platform_delete_collel(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.platform_delete_collel(text,uuid,text) TO catalog_app;
