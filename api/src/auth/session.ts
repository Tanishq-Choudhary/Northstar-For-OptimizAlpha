import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "northstar_session";

const TOKEN_ISSUER = "northstar-api";

export interface SessionClaims {
  sub: string;
  tid: string;
  email: string;
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    path: "/",
  };
}

export function issueSession(res: Response, claims: SessionClaims): void {
  const token = jwt.sign(claims, env.JWT_SECRET, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_ISSUER,
    expiresIn: env.SESSION_TTL_SECONDS,
  });

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_ISSUER,
    });

    if (typeof payload === "string") return null;

    const { sub, tid, email } = payload;
    if (typeof sub !== "string" || typeof tid !== "string" || typeof email !== "string") {
      return null;
    }
    if (!/^\d+$/.test(tid) || !/^\d+$/.test(sub)) return null;

    return { sub, tid, email };
  } catch {
    return null;
  }
}