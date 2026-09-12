import { Router } from "express";
import { withTenant } from "../db/pool.js";
import { asyncHandler } from "../http/errors.js";
import { authContext, requireAuth } from "../http/require-auth.js";

interface TotalsRow {
  start_date: string | null;
  end_date: string | null;
  start_market_value: string;
  end_market_value: string;
  period_return: string | null;
}

interface AssetClassRow {
  asset_class: string;
  market_value: string;
  positions: number;
}

const TOTALS_SQL = `
  WITH bounds AS (
    SELECT min(as_of_date) AS start_date, max(as_of_date) AS end_date FROM holdings
  ),
  totals AS (
    SELECT
      b.start_date,
      b.end_date,
      coalesce((SELECT sum(market_value) FROM holdings WHERE as_of_date = b.start_date), 0) AS start_mv,
      coalesce((SELECT sum(market_value) FROM holdings WHERE as_of_date = b.end_date), 0) AS end_mv
    FROM bounds b
  )
  SELECT
    start_date,
    end_date,
    round(start_mv, 2) AS start_market_value,
    round(end_mv, 2) AS end_market_value,
    CASE WHEN start_mv = 0 THEN NULL ELSE round((end_mv - start_mv) / start_mv, 8) END AS period_return
  FROM totals
`;

const BY_ASSET_CLASS_SQL = `
  SELECT
    asset_class,
    round(sum(market_value), 2) AS market_value,
    count(*)::int AS positions
  FROM holdings
  WHERE as_of_date = (SELECT max(as_of_date) FROM holdings)
  GROUP BY asset_class
  ORDER BY sum(market_value) DESC, asset_class
`;

export const portfolioRouter = Router();

portfolioRouter.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = authContext(req);

    const summary = await withTenant(auth.tenantId, async (client) => {
      const totals = (await client.query<TotalsRow>(TOTALS_SQL)).rows[0];
      const breakdown = await client.query<AssetClassRow>(BY_ASSET_CLASS_SQL);
      return { totals, breakdown: breakdown.rows };
    });

    const totals = summary.totals;

    if (!totals?.start_date || !totals.end_date) {
      res.json({
        hasData: false,
        startDate: null,
        endDate: null,
        startMarketValue: null,
        endMarketValue: null,
        periodReturn: null,
        byAssetClass: [],
      });
      return;
    }

    res.json({
      hasData: true,
      startDate: totals.start_date,
      endDate: totals.end_date,
      startMarketValue: totals.start_market_value,
      endMarketValue: totals.end_market_value,
      periodReturn: totals.period_return,
      byAssetClass: summary.breakdown.map((row) => ({
        assetClass: row.asset_class,
        marketValue: row.market_value,
        positions: row.positions,
      })),
    });
  }),
);