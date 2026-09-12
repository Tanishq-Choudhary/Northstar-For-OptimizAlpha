import { useState } from "react";
import { ApiError, api, type User } from "../api/client";
import { Wordmark } from "../components/ui";

const SHOW_DEMO_ACCOUNTS = import.meta.env.VITE_DEMO_ACCOUNTS !== "false";

const DEMO_ACCOUNTS = [
  { email: "tenant_a@example.com", tenant: "Alpha Capital" },
  { email: "tenant_b@example.com", tenant: "Beacon Advisors" },
];

export function Login({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(email, password));
    } catch (caught) {
      setError((caught as ApiError).message);
      setBusy(false);
    }
  };

  const fieldClass =
    "w-full rounded-sm border border-line bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface/40 px-6 py-12">
      <div className="w-full max-w-sm">
        <Wordmark className="text-[17px]" />
        <p className="mt-1 text-[13px] text-muted">Sign in to view your holdings.</p>

        <div className="mt-5 rounded-sm border border-line bg-paper p-5">
          <div className="space-y-3.5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void signIn()}
                className={fieldClass}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void signIn()}
                className={fieldClass}
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-sm bg-down-soft px-3 py-2 text-[13px] text-down">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void signIn()}
              disabled={busy || !email || !password}
              className="w-full rounded-sm bg-accent px-3 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>

        {SHOW_DEMO_ACCOUNTS ? (
          <div className="mt-4 rounded-sm border border-line bg-paper px-4 py-3">
            <p className="text-[12px] text-muted">Seeded accounts — click to fill</p>
            <div className="mt-2 space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("Password123!");
                  }}
                  className="flex w-full items-baseline gap-2 text-left text-[12px] text-ink-soft hover:text-accent"
                >
                  <span className="font-medium">{account.email}</span>
                  <span className="text-muted">{account.tenant}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}