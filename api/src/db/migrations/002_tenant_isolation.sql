CREATE FUNCTION current_tenant_id() RETURNS BIGINT
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::BIGINT;
$$;

ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON tenants
  FOR SELECT USING (id = current_tenant_id());

CREATE POLICY users_isolation ON users
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY holdings_isolation ON holdings
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE FUNCTION auth_lookup_user(p_email TEXT)
RETURNS TABLE (id BIGINT, tenant_id BIGINT, email TEXT, password_hash TEXT, tenant_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, t.name
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.email = lower(btrim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_lookup_user(TEXT) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO northstar_app;
GRANT SELECT ON tenants, users TO northstar_app;
GRANT SELECT, INSERT, UPDATE ON holdings TO northstar_app;
GRANT EXECUTE ON FUNCTION auth_lookup_user(TEXT) TO northstar_app;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO northstar_app;