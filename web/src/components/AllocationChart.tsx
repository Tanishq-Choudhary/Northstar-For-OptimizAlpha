import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AssetClassSlice } from "../api/client";
import { formatCompact, formatCurrency } from "../lib/format";

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { assetClass: string; value: number } }[];
}

function ChartTooltip({ active, payload }: TooltipPayload) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;

  return (
    <div className="rounded-sm border border-line-strong bg-paper px-3 py-2 text-[12px]">
      <p className="font-medium text-ink">{entry.assetClass}</p>
      <p className="num mt-0.5 text-ink-soft">{formatCurrency(entry.value)}</p>
    </div>
  );
}

export function AllocationChart({ rows }: { rows: AssetClassSlice[] }) {
  const data = rows.map((row) => ({ assetClass: row.assetClass, value: Number(row.marketValue) }));

  return (
    <div className="h-[220px] w-full min-w-0 px-1 py-4 sm:h-[264px] sm:px-2">
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="assetClass"
            tickLine={false}
            axisLine={{ stroke: "var(--color-line)" }}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            interval={0}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={46}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            tickFormatter={(value: number) => formatCompact(value)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-surface)" }} />
          <Bar dataKey="value" fill="var(--color-accent)" maxBarSize={56} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}