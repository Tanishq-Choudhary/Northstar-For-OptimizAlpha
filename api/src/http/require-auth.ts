import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession } from "../auth/session.js";
import { unauthorized } from "./errors.js";

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[SESSION_COOKIE];

  if (typeof token !== "string" || token.length === 0) {
    next(unauthorized());
    return;
  }

  const claims = verifySession(token);

  if (!claims) {
    next(unauthorized("Session is invalid or has expired"));
    return;
  }

  req.auth = { userId: claims.sub, tenantId: claims.tid, email: claims.email };
  next();
}

export function authContext(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}