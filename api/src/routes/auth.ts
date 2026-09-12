import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { clearSession, issueSession } from "../auth/session.js";
import { appPool, withTenant } from "../db/pool.js";
import { asyncHandler, badRequest, unauthorized } from "../http/errors.js";
import { authContext, requireAuth } from "../http/require-auth.js";

const DECOY_HASH = bcrypt.hashSync("northstar-no-such-account", 10);

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
    });
  },
});

interface AuthLookupRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  tenant_name: string;
}

export const authRouter = Router();

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequest("INVALID_CREDENTIALS_FORMAT", "Email and password are required");
    }

    const { email, password } = parsed.data;

    const { rows } = await appPool.query<AuthLookupRow>(
      "SELECT id, tenant_id, email, password_hash, tenant_name FROM auth_lookup_user($1)",
      [email],
    );

    const account = rows[0];
    const passwordMatches = await bcrypt.compare(password, account?.password_hash ?? DECOY_HASH);

    if (!account || !passwordMatches) {
      throw unauthorized("Invalid email or password");
    }

    issueSession(res, { sub: account.id, tid: account.tenant_id, email: account.email });

    res.json({
      user: {
        id: account.id,
        email: account.email,
        tenantId: account.tenant_id,
        tenantName: account.tenant_name,
      },
    });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = authContext(req);

    const profile = await withTenant(auth.tenantId, async (client) => {
      const { rows } = await client.query<{
        id: string;
        email: string;
        tenant_id: string;
        tenant_name: string;
      }>(
        `SELECT u.id, u.email, t.id AS tenant_id, t.name AS tenant_name
           FROM users u
           JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = $1`,
        [auth.userId],
      );
      return rows[0] ?? null;
    });

    if (!profile) throw unauthorized("Session is no longer valid");

    res.json({
      user: {
        id: profile.id,
        email: profile.email,
        tenantId: profile.tenant_id,
        tenantName: profile.tenant_name,
      },
    });
  }),
);