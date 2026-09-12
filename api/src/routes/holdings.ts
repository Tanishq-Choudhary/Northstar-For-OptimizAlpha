import { Router } from "express";
import multer, { MulterError } from "multer";
import { env } from "../config/env.js";
import { parseHoldingsCsv, type HoldingRow } from "../csv/holdings-csv.js";
import { withTenant } from "../db/pool.js";
import { AppError, asyncHandler, badRequest } from "../http/errors.js";
import { authContext, requireAuth } from "../http/require-auth.js";

const INSERT_CHUNK_SIZE = 5_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, callback) => {
    const looksLikeCsv =
      file.originalname.toLowerCase().endsWith(".csv") ||
      ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.mimetype);

    if (!looksLikeCsv) {
      callback(badRequest("UNSUPPORTED_FILE_TYPE", "Only .csv files are accepted"));
      return;
    }
    callback(null, true);
  },
});

const acceptSingleCsv = (
  req: Parameters<ReturnType<typeof upload.single>>[0],
  res: Parameters<ReturnType<typeof upload.single>>[1],
  next: Parameters<ReturnType<typeof upload.single>>[2],
) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File exceeds the ${(env.MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB limit`
          : "Upload must contain exactly one file field named \"file\"";
      next(badRequest(`UPLOAD_${error.code}`, message));
      return;
    }
    next(error);
  });
};

async function ingest(tenantId: string, rows: HoldingRow[]): Promise<void> {
  await withTenant(tenantId, async (client) => {
    for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);

      await client.query(
        `INSERT INTO holdings (tenant_id, as_of_date, ticker, asset_class, quantity, price)
         SELECT $1, source.as_of_date, source.ticker, source.asset_class, source.quantity, source.price
           FROM unnest($2::date[], $3::text[], $4::text[], $5::numeric[], $6::numeric[])
             AS source(as_of_date, ticker, asset_class, quantity, price)
         ON CONFLICT (tenant_id, as_of_date, ticker) DO UPDATE
            SET asset_class = excluded.asset_class,
                quantity    = excluded.quantity,
                price       = excluded.price,
                updated_at  = now()`,
        [
          tenantId,
          chunk.map((row) => row.asOfDate),
          chunk.map((row) => row.ticker),
          chunk.map((row) => row.assetClass),
          chunk.map((row) => row.quantity),
          chunk.map((row) => row.price),
        ],
      );
    }
  });
}

export const holdingsRouter = Router();

holdingsRouter.post(
  "/upload",
  requireAuth,
  acceptSingleCsv,
  asyncHandler(async (req, res) => {
    const auth = authContext(req);

    if (!req.file) {
      throw badRequest("NO_FILE", 'Attach a CSV file in a field named "file"');
    }

    const skipInvalidRows = req.query.mode === "skip-invalid";
    const result = await parseHoldingsCsv(req.file.buffer, { maxRows: env.MAX_UPLOAD_ROWS });
    const blocked = result.fatal || (result.issues.length > 0 && !skipInvalidRows);

    if (blocked || result.rows.length === 0) {
      throw new AppError(
        422,
        "CSV_VALIDATION_FAILED",
        result.fatal
          ? "The file could not be read."
          : `${result.issues.length} problem row(s) found. Nothing was imported.`,
        {
          rowsRead: result.rowsRead,
          truncated: result.truncated,
          canSkipInvalidRows: !result.fatal && result.rows.length > 0,
          validRowCount: result.rows.length,
          issues: result.issues,
        },
      );
    }

    await ingest(auth.tenantId, result.rows);

    const dates = result.rows.map((row) => row.asOfDate).sort();

    res.status(201).json({
      accepted: true,
      rowsIngested: result.rows.length,
      rowsSkipped: result.issues.length,
      skipped: result.issues,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      assetClasses: new Set(result.rows.map((row) => row.assetClass)).size,
    });
  }),
);

holdingsRouter.delete(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = authContext(req);

    const deleted = await withTenant(auth.tenantId, async (client) => {
      const result = await client.query("DELETE FROM holdings");
      return result.rowCount ?? 0;
    });

    res.json({ deleted });
  }),
);