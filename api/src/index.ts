import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { ensureAppGrants, ensureAppRole } from "./db/bootstrap.js";
import { migrate } from "./db/migrate.js";
import { appPool, createAdminPool } from "./db/pool.js";
import { seed } from "./db/seed.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { startKeepAlive } from "./ops/keep-alive.js";
import { authRouter } from "./routes/auth.js";
import { holdingsRouter } from "./routes/holdings.js";
import { portfolioRouter } from "./routes/portfolio.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());

  if (env.CORS_ORIGIN) {
    app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  }

  app.use((req, res, next) => {
    res.locals.requestId = req.header("x-request-id") ?? randomUUID();
    res.setHeader("x-request-id", res.locals.requestId);
    next();
  });

  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      await appPool.query("SELECT 1");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/holdings", holdingsRouter);
  app.use("/api/portfolio", portfolioRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function bootstrapDatabase(): Promise<void> {
  const adminPool = createAdminPool();

  try {
    await ensureAppRole(adminPool, env.APP_DB_PASSWORD);
    const applied = await migrate(adminPool);
    await ensureAppGrants(adminPool);
    const seeded = await seed(adminPool);
    console.log(
      `[boot] migrations applied: ${applied.length ? applied.join(", ") : "none"}; seed: ${seeded ? "ok" : "skipped"}`,
    );
  } finally {
    await adminPool.end();
  }
}

async function main(): Promise<void> {
  await bootstrapDatabase();

  const server = createApp().listen(env.PORT, () => {
    console.log(`[boot] api listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const stopKeepAlive = startKeepAlive();

  const shutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received`);
    stopKeepAlive();
    server.close(async () => {
      await appPool.end().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (process.env.NORTHSTAR_SKIP_MAIN !== "1") {
  main().catch((error) => {
    console.error("[boot] failed to start", error);
    process.exit(1);
  });
}