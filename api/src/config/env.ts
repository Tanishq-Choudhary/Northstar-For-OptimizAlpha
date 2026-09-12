import { z } from "zod";

export const DEV_JWT_SECRET = "dev_only_insecure_secret_change_before_deploying";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  ADMIN_DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),
  APP_DB_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(16),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(60 * 60 * 8),
  SEED_PASSWORD: z.string().min(8).default("Password123!"),
  SEED_DEMO_ACCOUNTS: z.enum(["true", "false"]).optional(),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  CORS_ORIGIN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(5 * 1024 * 1024),
  MAX_UPLOAD_ROWS: z.coerce.number().int().min(1).default(50_000),
  KEEPALIVE_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  KEEPALIVE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(10 * 60 * 1000),
});

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  if (decodeURIComponent(new URL(env.APP_DATABASE_URL).password) !== env.APP_DB_PASSWORD) {
    throw new Error("APP_DATABASE_URL password does not match APP_DB_PASSWORD");
  }

  if (env.NODE_ENV === "production") {
    if (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be a unique value of at least 32 characters in production");
    }
    if (!env.CORS_ORIGIN) {
      throw new Error("CORS_ORIGIN must be set explicitly in production");
    }
  }

  const isProduction = env.NODE_ENV === "production";

  return {
    ...env,
    isProduction,
    useSsl: env.DATABASE_SSL === "true",
    seedDemoAccounts: env.SEED_DEMO_ACCOUNTS ? env.SEED_DEMO_ACCOUNTS === "true" : !isProduction,
  } as const;
}

export const env = load();
export type Env = typeof env;