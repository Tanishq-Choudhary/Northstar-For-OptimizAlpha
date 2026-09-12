import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { env } from "../config/env.js";

const BCRYPT_COST = 10;

const TENANTS = [
  { id: 1, name: "Alpha Capital" },
  { id: 2, name: "Beacon Advisors" },
] as const;

const USERS = [
  { tenantId: 1, email: "tenant_a@example.com" },
  { tenantId: 2, email: "tenant_b@example.com" },
] as const;

export async function seed(pool: Pool): Promise<boolean> {
  if (!env.seedDemoAccounts) return false;

  const passwordHash = await bcrypt.hash(env.SEED_PASSWORD, BCRYPT_COST);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const tenant of TENANTS) {
      await client.query(
        "INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [tenant.id, tenant.name],
      );
    }

    await client.query(
      "SELECT setval(pg_get_serial_sequence('tenants', 'id'), coalesce(max(id), 1)) FROM tenants",
    );

    for (const user of USERS) {
      await client.query(
        `INSERT INTO users (tenant_id, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash`,
        [user.tenantId, user.email, passwordHash],
      );
    }

    await client.query(
      "SELECT setval(pg_get_serial_sequence('users', 'id'), coalesce(max(id), 1)) FROM users",
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}