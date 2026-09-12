import type { AssetClassSlice } from "../api/client";
import { formatCurrency, share } from "../lib/format";

export function AllocationTable({ rows, total }: { rows: AssetClassSlice[]; total: string }) {
  return (
    <table className="w-full table-fixed text-[13px]">
      <colgroup>
        <col />
        <col className="w-20" />
        <col className="w-32 sm:w-36" />
        <col className="hidden w-36 sm:table-column" />
      </colgroup>
      <thead>
        <tr className="border-b border-line text-[12px] text-muted">
          <th className="px-3 py-2.5 text-left font-medium sm:px-4">Asset class</th>
          <th className="px-2 py-2.5 text-right font-medium sm:px-4">Positions</th>
          <th className="px-3 py-2.5 text-right font-medium sm:px-4">Market value</th>
          <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const fraction = share(row.marketValue, total);
          return (
            <tr key={row.assetClass} className="border-b border-line last:border-b-0">
              <td className="truncate px-3 py-3 font-medium text-ink sm:px-4">{row.assetClass}</td>
              <td className="num px-2 py-3 text-right text-ink-soft sm:px-4">{row.positions}</td>
              <td className="num px-3 py-3 text-right font-medium text-ink sm:px-4">
                <span className="block truncate">{formatCurrency(row.marketValue)}</span>
                <span className="num mt-0.5 block text-[12px] font-normal text-muted sm:hidden">
                  {(fraction * 100).toFixed(1)}%
                </span>
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <div className="flex items-center justify-end gap-2.5">
                  <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(fraction * 100, 1)}%` }}
                    />
                  </span>
                  <span className="num w-11 shrink-0 text-right text-ink-soft">
                    {(fraction * 100).toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-line-strong bg-surface/60">
          <td className="px-3 py-3 font-semibold text-ink sm:px-4">Total</td>
          <td className="num px-2 py-3 text-right text-ink-soft sm:px-4">
            {rows.reduce((sum, row) => sum + row.positions, 0)}
          </td>
          <td className="num truncate px-3 py-3 text-right font-semibold text-ink sm:px-4">
            {formatCurrency(total)}
          </td>
          <td className="num hidden px-4 py-3 text-right text-ink-soft sm:table-cell">100.0%</td>
        </tr>
      </tfoot>
    </table>
  );
}