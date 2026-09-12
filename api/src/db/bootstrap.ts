import type { Pool } from "pg";

export async function ensureAppRole(pool: Pool, password: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('northstar.app_password', $1, true)", [password]);
    await client.query(`
      DO $$
      DECLARE
        v_password TEXT := current_setting('northstar.app_password', true);
      BEGIN
        IF v_password IS NULL OR length(v_password) < 8 THEN
          RAISE EXCEPTION 'northstar.app_password was not provided';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'northstar_app') THEN
          EXECUTE format('ALTER ROLE northstar_app WITH LOGIN PASSWORD %L', v_password);
        ELSE
          EXECUTE format('CREATE ROLE northstar_app WITH LOGIN PASSWORD %L', v_password);
        END IF;

        EXECUTE format('GRANT CONNECT ON DATABASE %I TO northstar_app', current_database());
      END
      $$;
    `);

    const { rows } = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
         FROM pg_roles WHERE rolname = 'northstar_app'`,
    );

    const role = rows[0];

    if (!role) {
      throw new Error("northstar_app was not created");
    }

    if (role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole) {
      throw new Error(
        "northstar_app holds privileges it must not have; row-level security would not apply to it",
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureAppGrants(pool: Pool): Promise<void> {
  await pool.query(`
    GRANT USAGE ON SCHEMA public TO northstar_app;
    GRANT SELECT ON tenants, users TO northstar_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON holdings TO northstar_app;
    GRANT EXECUTE ON FUNCTION auth_lookup_user(TEXT) TO northstar_app;
    GRANT EXECUTE ON FUNCTION current_tenant_id() TO northstar_app;
  `);
}