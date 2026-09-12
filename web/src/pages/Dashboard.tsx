import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type PortfolioSummary, type User } from "../api/client";
import { AllocationChart } from "../components/AllocationChart";
import { AllocationTable } from "../components/AllocationTable";
import { UploadPanel } from "../components/UploadPanel";
import { EmptyState, Section, Skeleton, TopBar, plural } from "../components/ui";
import { formatCurrency, formatDate, formatPercent } from "../lib/format";

function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";

  return (
    <div className="flex-1 px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`num mt-1 text-[20px] font-semibold tracking-tight sm:text-[22px] ${toneClass}`}>
        {value}
      </p>
      {hint ? <p className="num mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Dashboard({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await api.summary());
    } catch (caught) {
      const failure = caught as ApiError;
      if (failure.status === 401) {
        onSignedOut();
        return;
      }
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearHoldings = async () => {
    setClearing(true);
    try {
      await api.clearHoldings();
      setConfirmingClear(false);
      await load();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setClearing(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.logout();
    } finally {
      onSignedOut();
    }
  };

  const periodReturn = summary?.periodReturn == null ? null : Number(summary.periodReturn);
  const tone = periodReturn === null ? "neutral" : periodReturn >= 0 ? "up" : "down";
  const change =
    summary?.hasData && summary.endMarketValue && summary.startMarketValue
      ? Number(summary.endMarketValue) - Number(summary.startMarketValue)
      : null;

  return (
    <div className="min-h-screen bg-surface/40">
      <TopBar user={user} onLogout={() => void signOut()} busy={signingOut} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-7">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink sm:text-[20px]">Portfolio</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {summary?.hasData
              ? `${formatDate(summary.startDate)} to ${formatDate(summary.endDate)}`
              : "No holdings imported yet"}
          </p>
        </div>

        {error ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-down/25 bg-down-soft px-4 py-3">
            <p className="text-[13px] text-down">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto rounded-sm border border-down/30 px-2.5 py-1 text-[12px] font-medium text-down"
            >
              Try again
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 space-y-5">
            <Skeleton className="h-[92px]" />
            <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
              <Skeleton className="h-64 lg:col-span-3" />
              <Skeleton className="h-64 lg:col-span-2" />
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid divide-y divide-line rounded-sm border border-line bg-paper sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Metric
                label="Market value"
                value={formatCurrency(summary?.endMarketValue ?? null)}
                hint={summary?.hasData ? `as of ${formatDate(summary.endDate)}` : undefined}
              />
              <Metric
                label="Period return"
                value={formatPercent(summary?.periodReturn ?? null)}
                tone={tone}
                hint={
                  summary?.hasData && summary.startMarketValue
                    ? `from ${formatCurrency(summary.startMarketValue)}`
                    : undefined
                }
              />
              <Metric
                label="Change"
                value={change === null ? "—" : formatCurrency(change)}
                tone={tone}
                hint={summary?.hasData ? plural(summary.byAssetClass.length, "asset class", "asset classes") : undefined}
              />
            </div>

            {summary?.hasData ? (
              <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
                <div className="min-w-0 lg:col-span-3">
                  <Section
                    title="Allocation by asset class"
                    description={`Valued at ${formatDate(summary.endDate)}`}
                  >
                    <AllocationTable rows={summary.byAssetClass} total={summary.endMarketValue ?? "0"} />
                  </Section>
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <Section title="Market value">
                    <AllocationChart rows={summary.byAssetClass} />
                  </Section>
                </div>
              </div>
            ) : (
              <Section title="Allocation by asset class">
                <EmptyState
                  title="Nothing to show yet"
                  body="Import a holdings CSV and your allocation and period return will appear here."
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById("import")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        document.getElementById("holdings-file")?.click();
                      }}
                      className="rounded-sm bg-accent px-4 py-2 text-[13px] font-medium text-white"
                    >
                      Import holdings
                    </button>
                  }
                />
              </Section>
            )}

            <div id="import" className="scroll-mt-20">
              <Section
                title="Import holdings"
                description="Rows are checked before anything is saved. A file with problems is rejected in full."
                action={
                  summary?.hasData ? (
                    confirmingClear ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-muted">Remove all holdings?</span>
                        <button
                          type="button"
                          onClick={() => void clearHoldings()}
                          disabled={clearing}
                          className="rounded-sm border border-down/40 px-2.5 py-1 text-[12px] font-medium text-down disabled:opacity-50"
                        >
                          {clearing ? "Clearing…" : "Yes, clear"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingClear(false)}
                          className="text-[12px] text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingClear(true)}
                        className="rounded-sm border border-line px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                      >
                        Clear holdings
                      </button>
                    )
                  ) : undefined
                }
              >
                <UploadPanel onUploaded={() => void load()} />
              </Section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}