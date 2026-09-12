const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatCurrency(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? currency.format(numeric) : "—";
}

export function formatCompact(value: number): string {
  return `$${compact.format(value)}`;
}

export function formatPercent(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? percent.format(numeric) : "—";
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function share(value: string, total: string): number {
  const denominator = Number(total);
  return denominator === 0 ? 0 : Number(value) / denominator;
}