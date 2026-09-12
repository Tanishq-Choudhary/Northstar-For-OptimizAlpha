import { Component, type ErrorInfo, type ReactNode } from "react";
import type { User } from "../api/client";

export function plural(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight text-ink ${className}`}>
      Northstar<span className="text-accent">.</span>
    </span>
  );
}

export function TopBar({ user, onLogout, busy }: { user: User; onLogout: () => void; busy: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Wordmark className="text-[15px]" />
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-soft">
          {user.tenantName}
        </span>
        <span className="hidden max-w-[220px] truncate text-[13px] text-muted md:block">
          {user.email}
        </span>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-sm border border-line bg-paper">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xs bg-surface ${className}`} />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

interface BoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[14px] font-medium text-ink">This page stopped responding</p>
          <p className="mt-1 text-[13px] text-muted">
            Reload to continue. Your data has not been changed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-sm bg-accent px-4 py-2 text-[13px] font-medium text-white"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}