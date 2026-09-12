import pg from "pg";
import { env } from "../config/env.js";

const { Pool, types } = pg;

types.setTypeParser(types.builtins.NUMERIC, (value) => value);
types.setTypeParser(types.builtins.INT8, (value) => value);
types.setTypeParser(types.builtins.DATE, (value) => value);

const ssl = env.useSsl ? { rejectUnauthorized: false } : undefined;

export const appPool = new Pool({
  connectionString: env.APP_DATABASE_URL,
  ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
  application_name: "northstar-api",
});

appPool.on("error", (error) => {
  console.error("[db] idle client error", error);
});

export function createAdminPool(): pg.Pool {
  return new Pool({
    connectionString: env.ADMIN_DATABASE_URL,
    ssl,
    max: 2,
    connectionTimeoutMillis: 10_000,
    application_name: "northstar-migrator",
  });
}

export async function withTenant<T>(
  tenantId: string,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}