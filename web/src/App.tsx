import { useEffect, useState } from "react";
import { api, type User } from "./api/client";
import { ErrorBoundary } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";

type Session = { state: "checking" } | { state: "anonymous" } | { state: "active"; user: User };

export default function App() {
  const [session, setSession] = useState<Session>({ state: "checking" });

  useEffect(() => {
    api
      .me()
      .then((user) => setSession({ state: "active", user }))
      .catch(() => setSession({ state: "anonymous" }));
  }, []);

  return (
    <ErrorBoundary>
      {session.state === "checking" ? (
        <div className="min-h-screen bg-surface/40" aria-busy="true" />
      ) : session.state === "anonymous" ? (
        <Login onSignedIn={(user) => setSession({ state: "active", user })} />
      ) : (
        <Dashboard user={session.user} onSignedOut={() => setSession({ state: "anonymous" })} />
      )}
    </ErrorBoundary>
  );
}