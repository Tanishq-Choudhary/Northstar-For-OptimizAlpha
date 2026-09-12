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
          EXECUTE format(
            'ALTER ROLE northstar_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
            v_password
          );
        ELSE
          EXECUTE format(
            'CREATE ROLE northstar_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
            v_password
          );
        END IF;

        EXECUTE format('GRANT CONNECT ON DATABASE %I TO northstar_app', current_database());
      END
      $$;
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}