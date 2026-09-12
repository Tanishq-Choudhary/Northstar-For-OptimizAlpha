import { env } from "../config/env.js";

export function startKeepAlive(): () => void {
  const target = env.KEEPALIVE_URL;
  if (!target) return () => undefined;

  const ping = () => {
    fetch(target, { signal: AbortSignal.timeout(10_000) }).catch((error: unknown) => {
      console.warn(`[keepalive] ping failed: ${(error as Error).message}`);
    });
  };

  const timer = setInterval(ping, env.KEEPALIVE_INTERVAL_MS);
  timer.unref();

  console.log(`[keepalive] pinging ${target} every ${env.KEEPALIVE_INTERVAL_MS / 60_000} minutes`);

  return () => clearInterval(timer);
}