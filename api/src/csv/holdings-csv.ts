import { parse } from "csv-parse";

export const REQUIRED_COLUMNS = ["date", "ticker", "asset_class", "quantity", "price"] as const;

const MAX_REPORTED_ISSUES = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^-?\d{1,18}(\.\d{1,8})?$/;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-_]{0,15}$/;

export interface HoldingRow {
  asOfDate: string;
  ticker: string;
  assetClass: string;
  quantity: string;
  price: string;
}

export interface RowIssue {
  line: number;
  column: string | null;
  code: string;
  message: string;
}

export interface ParseResult {
  rows: HoldingRow[];
  issues: RowIssue[];
  rowsRead: number;
  fatal: boolean;
  truncated: boolean;
}

export interface ParseOptions {
  maxRows: number;
  today?: string;
}

function fatalResult(rowsRead: number, issue: RowIssue): ParseResult {
  return { rows: [], issues: [issue], rowsRead, fatal: true, truncated: false };
}

function isRealCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function normaliseHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_");
}

function validateRow(
  raw: Record<string, string>,
  line: number,
  today: string,
  issues: RowIssue[],
): HoldingRow | null {
  const add = (column: string | null, code: string, message: string) =>
    issues.push({ line, column, code, message });

  const before = issues.length;

  const asOfDate = (raw.date ?? "").trim();
  if (!asOfDate) add("date", "MISSING_VALUE", "date is empty");
  else if (!isRealCalendarDate(asOfDate)) add("date", "INVALID_DATE", `"${asOfDate}" is not a valid YYYY-MM-DD date`);
  else if (asOfDate > today) add("date", "FUTURE_DATE", `"${asOfDate}" is in the future`);

  const ticker = (raw.ticker ?? "").trim().toUpperCase();
  if (!ticker) add("ticker", "MISSING_VALUE", "ticker is empty");
  else if (!TICKER_PATTERN.test(ticker)) add("ticker", "INVALID_TICKER", `"${ticker}" is not a valid ticker`);

  const assetClass = (raw.asset_class ?? "").trim().replace(/\s+/g, " ");
  if (!assetClass) add("asset_class", "MISSING_VALUE", "asset_class is empty");
  else if (assetClass.length > 32) add("asset_class", "INVALID_ASSET_CLASS", "asset_class exceeds 32 characters");

  const numeric: Record<string, string> = {};
  for (const column of ["quantity", "price"] as const) {
    const value = (raw[column] ?? "").trim();
    if (!value) add(column, "MISSING_VALUE", `${column} is empty`);
    else if (!DECIMAL_PATTERN.test(value)) add(column, "INVALID_NUMBER", `"${value}" is not a valid number`);
    else if (value.startsWith("-")) add(column, "NEGATIVE_VALUE", `${column} must not be negative`);
    else numeric[column] = value;
  }

  if (issues.length !== before) return null;

  return {
    asOfDate,
    ticker,
    assetClass,
    quantity: numeric.quantity as string,
    price: numeric.price as string,
  };
}

export async function parseHoldingsCsv(
  content: Buffer,
  options: ParseOptions,
): Promise<ParseResult> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const issues: RowIssue[] = [];
  const rows: HoldingRow[] = [];
  const seen = new Map<string, { line: number; row: HoldingRow }>();

  let rowsRead = 0;
  let headerChecked = false;

  const parser = parse({
    bom: true,
    columns: (header: string[]) => header.map(normaliseHeader),
    trim: false,
    skip_empty_lines: true,
    relax_column_count: false,
    info: true,
  });

  parser.write(content);
  parser.end();

  try {
    for await (const entry of parser) {
      const { record, info } = entry as { record: Record<string, string>; info: { lines: number } };

      if (!headerChecked) {
        headerChecked = true;
        const missing = REQUIRED_COLUMNS.filter((column) => !(column in record));
        if (missing.length > 0) {
          return fatalResult(0, {
            line: 1,
            column: null,
            code: "MISSING_COLUMNS",
            message: `header is missing required column(s): ${missing.join(", ")}`,
          });
        }
      }

      rowsRead += 1;

      if (rowsRead > options.maxRows) {
        return fatalResult(rowsRead, {
          line: info.lines,
          column: null,
          code: "TOO_MANY_ROWS",
          message: `file exceeds the ${options.maxRows.toLocaleString()} row limit`,
        });
      }

      const row = validateRow(record, info.lines, today, issues);
      if (!row) continue;

      const key = `${row.asOfDate}|${row.ticker}`;
      const previous = seen.get(key);

      if (previous) {
        const identical =
          previous.row.quantity === row.quantity &&
          previous.row.price === row.price &&
          previous.row.assetClass === row.assetClass;

        issues.push({
          line: info.lines,
          column: null,
          code: identical ? "DUPLICATE_ROW" : "CONFLICTING_DUPLICATE",
          message: identical
            ? `${row.ticker} on ${row.asOfDate} repeats line ${previous.line} exactly`
            : `${row.ticker} on ${row.asOfDate} conflicts with different values on line ${previous.line}`,
        });
        continue;
      }

      seen.set(key, { line: info.lines, row });
      rows.push(row);
    }
  } catch (error) {
    return fatalResult(rowsRead, {
      line: (error as { lines?: number }).lines ?? rowsRead + 2,
      column: null,
      code: "MALFORMED_CSV",
      message: (error as Error).message,
    });
  }

  if (rowsRead === 0) {
    return fatalResult(0, {
      line: 1,
      column: null,
      code: "EMPTY_FILE",
      message: "the file contains no data rows",
    });
  }

  return {
    rows,
    issues: issues.slice(0, MAX_REPORTED_ISSUES),
    rowsRead,
    fatal: false,
    truncated: issues.length > MAX_REPORTED_ISSUES,
  };
}